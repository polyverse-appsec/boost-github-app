import { createNodeMiddleware, Probot } from "probot";
import serverless from "serverless-http";
import { getSecret } from "./secrets";
import { saveInstallationInfo, deleteInstallationInfo } from "./account";
import { sendMonitoringEmail } from "./email";

console.log(`App version: ${process.env.APP_VERSION}`);

const appFn = (app: Probot) => {
    app.on(['installation', 'installation_repositories'], async (context) => {
        // Assuming context.payload is already parsed JSON in TypeScript version
        await handleInstallationChange(app, context.name, context.payload);
    });
};

// for pretty printing dates in error messages and logs
export const usFormatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
});

const BoostGitHubAppId = "472802";
const secretStore = 'boost/GitHubApp';
const secretKeyPrivateKey = `${secretStore}/private-key`;
const secretKeyWebhook = `${secretStore}/webhook`;

const maximumInstallationCallbackDurationInSeconds = 20;

async function handleInstallationDelete(installingUser: any, targetType: string) {
    // Call the function to delete installation info from DynamoDB
    try {

        // delete the data from DynamoDB to immediately block further access to GitHub by Boost backend
        await deleteInstallationInfo(installingUser.login, targetType === 'Organization');

        console.log(`Installation data deleted from Boost GitHub Database for account: ${installingUser.login}`);
        await sendMonitoringEmail(`GitHub App Deleted ${targetType}: ${installingUser.login}`,
            `Installation data deleted from Boost GitHub Database\n` +
            `\t* Type: ${targetType}\n` +
            `\t* Account: ${installingUser.login}`);
    } catch (error: any) {
        console.error(`Error deleting installation info from DynamoDB:`, error.callstack || error);
        await sendMonitoringEmail(`GitHub App Deletion Failure (${targetType}): ${installingUser.login}`,
            `Failed to delete installation data from Boost GitHub Database\n` +
            `\t* Date: ${usFormatter.format(new Date())}\n` +
            `\t* Type: ${targetType}\n` +
            `\t* Account: ${installingUser.login}\n` +
            `Error: ${JSON.stringify(error.stack || error)}`);
    }
}

async function handleInstallationChange(app: Probot, method: string, payload: any) {
    const startTimeOfInstallationCallbackInSeconds = new Date().getTime() / 1000;
    const installationId = payload.installation.id;
    const installingUser = payload.installation.account; // Information about the user who installed the app
    const targetType = payload.installation.target_type; // Type of the account ("User" or "Organization")

    console.log("Installation Change: Payload:", JSON.stringify(payload));

    if (payload.action === "deleted") {
        
        await handleInstallationDelete(installingUser, targetType);

        return;
    }

    const retrievedUser : boolean = await getUserInformation(app, installationId, installingUser, targetType);

    // don't log the repo info if we failed to get the user info, since we don't really have verified access
    //      so let's not put extra repo info in log
    if (!retrievedUser) {
        return;
    }
    await logRepoAccess(app, installationId, installingUser, targetType, payload, startTimeOfInstallationCallbackInSeconds);

}

async function getUserInformation(
    app: Probot,
    installationId: number,
    installingUser: any,
    targetType: string) : Promise<boolean> {
   
        // Get user information, including email address
    try {
        const octokit = await app.auth(installationId);

        // Determine if the installation is for a user or an organization
        if (targetType === 'Organization') {
            console.log(`Organization Installation: ${installingUser.login}`);
            await saveInstallationInfo(installingUser.login, installationId.toString(), installingUser.login);
            console.log(`Installation data saved to DynamoDB for Organization: ${installingUser.login}`);

            await sendMonitoringEmail(`GitHub App Installation: Organization: ${installingUser.login}`,
                `Installation data saved to Boost GitHub Database for Organization: ${installingUser.login}\n` +
                `\t* Date: ${usFormatter.format(new Date())}`);
        } else if (targetType === 'User') {
            const userInfo = await octokit.rest.users.getByUsername({
                username: installingUser.login,
            });

            if (userInfo.data.email) {
                const userEmail = userInfo.data.email.toLowerCase();
                console.log(`User Installation: ${userInfo.data.login}, Email: ${userEmail}`);
                await saveInstallationInfo(userEmail, installationId.toString(), userInfo.data.login);
                console.log(`Installation data saved to DynamoDB for User: ${userEmail}`);

                await sendMonitoringEmail(`GitHub App Installation: User: ${userInfo.data.login}`,
                    `Installation data saved to Boost GitHub Database for User: ${userInfo.data.login}\n` +
                    `\t* Date: ${usFormatter.format(new Date())}\n` +
                    `\t* Email: ${userEmail}`);
            } else {
                // Fetch the list of emails for the authenticated user
                const response = await octokit.rest.users.listEmailsForAuthenticatedUser();
                const primaryEmailObj = response.data.find(emailObj => emailObj.primary && emailObj.verified);

                if (primaryEmailObj) {
                    const primaryEmail = primaryEmailObj.email.toLowerCase();
                    console.log(`Primary email for ${installingUser.login}: ${primaryEmail}`);

                    await saveInstallationInfo(primaryEmail, installationId.toString(), installingUser.login);

                    await sendMonitoringEmail(`GitHub App Installation: User: ${installingUser.login}`,
                        `Installation data saved to Boost GitHub Database for User: ${installingUser.login}\n` +
                        `\t* Date: ${usFormatter.format(new Date())}\n` +
                        `\t* Email: ${primaryEmail}`);
                } else {
                    console.error(`No verified primary email found for: ${installingUser.login}`);
                }
            }
        }
        return true;
    } catch (error: any) {
        console.error(`Error getUserInformation:`, error.stack || error);
        await sendMonitoringEmail(`GitHub App Installation Failure (${targetType}): User Lookup Failure: ${installingUser.login}`,
            `Failed to get user information for installation\n` +
            `\t* Date: ${usFormatter.format(new Date())}\n` +
            `\t* Type: ${targetType}\n` +
            `\t* Account: ${installingUser.login}\n` +
            `\t* Error: ${JSON.stringify(error.stack || error)}`);
        return false;
    }
}

async function logRepoAccess(
    app: Probot,
    installationId: number,
    installingUser: any,
    targetType: string,
    payload: any, startTimeOfInstallationCallbackInSeconds: number) {
    const repositories = payload.repositories || payload.repositories_added;
    console.log('Repository Count: ', repositories.length);

    // the following code is used to scan all the Repos for debug/logging, but it is not necessary for the app to function
    //      or the org or user to be correctly registered
    for (const repo of repositories) {
        const secondsElapsedSinceCallbackStart = new Date().getTime() / 1000 - startTimeOfInstallationCallbackInSeconds;
        if (secondsElapsedSinceCallbackStart > maximumInstallationCallbackDurationInSeconds) {
            console.error(`Installation callback duration (29 seconds) may be exceeded; exiting Repo scan early (${secondsElapsedSinceCallbackStart} seconds) to avoid rude abort by Host`);
            return;
        }

        const octokit = await app.auth(installationId);

        try {
            // Fetch repository details to get the default branch
            const repoDetails = await octokit.rest.repos.get({
                owner: installingUser.login,
                repo: repo.name
            });
    
            const privateRepo = repoDetails.data.private?repoDetails.data.private:false;
            const sizeOfRepo = repoDetails.data.size?repoDetails.data.size:0;

            console.log(`Repo Access Granted for ${targetType} Repo: ${installingUser.login}: ${repo.name} (${privateRepo?"Private":"Public"}, Size: ${sizeOfRepo} kb)`);

        } catch (error: any) {
            if (error.status === 404) {
                console.warn(`${targetType} Repo may be empty - reporting not found: ${installingUser.login}: ${repo.name}`);
            } else if (error.response?.data) {
                console.error(`Error checking ${targetType} Repo Access for ${installingUser.login}: ${repo.name}:`, error.response.data);
            } else {
                console.error(`Error checking ${targetType} Repo Access for ${installingUser.login}: ${repo.name}:`, (error.stack || error));
            }
        }
    }
}

const initProbotApp = async () => {
    // Fetching secrets using AWS SDK v3
    const privateKey = await getSecret(secretKeyPrivateKey);
    const webhookSecret = await getSecret(secretKeyWebhook);

    process.env.PRIVATE_KEY = privateKey;
    process.env.WEBHOOK_SECRET = webhookSecret;

    const probot = new Probot({
        appId: BoostGitHubAppId,
        privateKey: process.env.PRIVATE_KEY,
        secret: process.env.WEBHOOK_SECRET,
    });

    const middleware = createNodeMiddleware(appFn, { probot });
    return serverless(middleware);
};

// AWS Lambda handler
export const handler = async (event: any, context: any) => {
    const probotServer = await initProbotApp();
    return probotServer(event, context);
};
