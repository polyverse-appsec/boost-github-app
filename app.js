// print the version of the app - from env variable APP_VERSION
console.log(`App version: ${process.env.APP_VERSION}`);

const { createNodeMiddleware, Probot } = require('probot');
const serverless = require('serverless-http');
const { getSecret } = require('./secrets');
const { saveInstallationInfo, deleteInstallationInfo } = require('./account');

const appFn = (app ) => {
    // Handle new installations
    app.on(['installation', 'installation_repositories'], async (context) => {
        if (Buffer.isBuffer(context.payload)) {
            context.payload = JSON.parse(context.payload.toString());
        } else if (typeof context.payload === 'string') {
            context.payload = JSON.parse(context.payload);
        }
        await handleInstallationChange(app, context.name, context.payload);

    });

};

const maximumInstallationCallbackDurationInSeconds = 20;

async function handleInstallationChange(app, method, payload) {

    const startTimeOfInstallationCallbackInSeconds = new Date().getTime() / 1000;
    const installationId = payload.installation.id;
    const installingUser = payload.installation.account; // Information about the user who installed the app
    const targetType = payload.installation.target_type; // Type of the account ("User" or "Organization")

    console.log("Installation Change: Payload:", JSON.stringify(payload));

    if (payload.action === "deleted") {
        // Call the function to delete installation info from DynamoDB
        try {

            // delete the data from DynamoDB to immediately block further access to GitHub by Boost backend
            await deleteInstallationInfo(installingUser.login);

            console.log(`Installation data deleted from DynamoDB for account: ${installingUser.login}`);
        } catch (error) {
            console.error(`Error deleting installation info from DynamoDB:`, error);
        }
        
        return;
    }

    // Get user information, including email address
    try {
        const octokit = await app.auth(installationId);
        const userInfo = await octokit.rest.users.getByUsername({
            username: installingUser.login,
        });
    
        // Determine if the installation is for a user or an organization
        if (targetType === 'Organization') {
            console.log(`Organization Installation: ${installingUser.login}`);
            await saveInstallationInfo(installingUser.login, installationId, installingUser.login);
            console.log(`Installation data saved to DynamoDB for Organization: ${installingUser.login}`);
        } else if (targetType === 'User') {
            const userInfo = await octokit.rest.users.getByUsername({
                username: installingUser.login,
            });

            if (userInfo.data.email) {
                const userEmail = userInfo.data.email.toLowerCase();
                console.log(`User Installation: ${userInfo.data.login}, Email: ${userEmail}`);
                await saveInstallationInfo(userEmail, installationId, userInfo.data.login);
                console.log(`Installation data saved to DynamoDB for User: ${userEmail}`);
            } else {
                // Fetch the list of emails for the authenticated user
                const response = await octokit.rest.users.listEmailsForAuthenticatedUser();
                const primaryEmailObj = response.data.find(emailObj => emailObj.primary && emailObj.verified);

                if (primaryEmailObj) {
                    const primaryEmail = primaryEmailObj.email.toLowerCase();
                    console.log(`Primary email for ${installingUser.login}: ${primaryEmail}`);
                    await saveInstallationInfo(primaryEmail, installationId, installingUser.login);
                    console.log(`Installation data saved to DynamoDB for User: ${primaryEmail}`);
                } else {
                    console.error(`No verified primary email found for: ${installingUser.login}`);
                }
                console.error(`User installation but no email info found for: ${installingUser.login}`);
            }
        }
    } catch (error) {
        console.error(`Error retrieving installation user info:`, error);
    }

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
                owner: owner,
                repo: repo
            });
    
            const privateRepo = repoDetails.data.private?repoDetails.data.private:false;
            const sizeOfRepo = repoDetails.data.size?repoDetails.data.size:0;

            console.log(`Repo Access Granted for ${targetType} Repo: ${installingUser.login}: ${repo.name} (${privateRepo?"Private":"Public"}, Size: ${sizeOfRepo} kb)`);

        } catch (error) {
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

const BoostGitHubAppId = "472802";

const secretStore = 'boost/GitHubApp';
const secretKeyPrivateKey = secretStore + '/' + 'private-key';
const secretKeyWebhook = secretStore + '/' + 'webhook';

// Async function to initialize and start the Probot app
const initProbotApp = async () => {
    // Fetch secrets
    const privateKey = await getSecret(secretKeyPrivateKey);
    const webhookSecret = await getSecret(secretKeyWebhook);

    process.env.PRIVATE_KEY = privateKey;
    process.env.WEBHOOK_SECRET = webhookSecret;
    // process.env.WEBHOOK_PROXY_URL = "https://smee.io/?????????";

    // Initialize Probot with the secrets
    const probot = new Probot({
        appId:BoostGitHubAppId,
        privateKey: privateKey,
        secret: webhookSecret,
    });

    const middleware = createNodeMiddleware(appFn, { probot });
    return serverless(middleware);
};

// AWS Lambda handler
module.exports.handler = async (event, context) => {
    const probotServer = await initProbotApp();

    return probotServer(event, context);
};
