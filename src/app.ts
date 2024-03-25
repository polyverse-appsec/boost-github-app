import { createNodeMiddleware, Probot } from "probot";
import serverless from "serverless-http";
import { getSecret } from "./secrets";
import { saveUser, deleteUserByUsername, deleteUser, getUser, getAccountByUsername } from "./account";
import { sendHtmlEmail, sendMonitoringEmail, PolyverseSupportEmail } from "./email";

console.log(`App version: ${process.env.APP_VERSION}`);

const appFn = (app: Probot) => {
    app.on(['installation', 'installation_repositories'], async (context) => {
        // Assuming context.payload is already parsed JSON in TypeScript version
        await handleInstallationChange(app, context.name, context.payload);
    });
};

// for pretty printing dates in error messages and logs
// print the date in PST with 12-hour time
export const usFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',

    year: 'numeric',
    month: 'long',
    day: '2-digit',

    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    
    hour12: true
});

const BoostGitHubAppId = "472802";
const secretStore = 'boost/GitHubApp';
const secretKeyPrivateKey = `${secretStore}/private-key`;
const secretKeyWebhook = `${secretStore}/webhook`;

const maximumInstallationCallbackDurationInSeconds = 20;

const userAppInstallFailurePrefix = `!`;

async function handleInstallationDelete(installingUser: any, targetType: string, sender: string) {
    // Call the function to delete installation info from DynamoDB
    try {

        const existingInstallInfo = await getAccountByUsername(installingUser.login);
        if (!existingInstallInfo) {
            console.warn(`Installation data not found in Boost GitHub Database for account: ${installingUser.login}`);

            // we'll continue to call delete in case there are placeholder accounts under the same login (E.g. unknown email key)
        } else if (existingInstallInfo.admin && existingInstallInfo.admin !== sender) {
            console.warn(`Installation data found in Boost GitHub Database for account: ${installingUser.login}, but requestor ${sender} does not match admin: ${existingInstallInfo.admin}`);
        }

            // only delete the install info, not the entire user profile
        await deleteUserByUsername(installingUser.login, sender, true);

        try {
            if (targetType === 'Organization') {
                const admin = existingInstallInfo?.admin;
                if (admin) {
                    const adminEmail = await getAccountByUsername(admin);
                    if (adminEmail?.account && adminEmail.account.includes('@')) {
                        await sendOrganizationDepartureEmail(adminEmail.account!, installingUser.login, sender);
                    } else {
                        console.error(`No admin email found for Organization: ${installingUser.login}`);
                    }
                } else {
                    console.error(`No admin found for Organization: ${installingUser.login}`);
                }
            } else {
                if (existingInstallInfo?.account && existingInstallInfo.account.includes('@')) {
                    await sendDepartureEmail(existingInstallInfo.account!, installingUser.login, sender);
                }
            }

            const existingInstallErrorInfo = await getUser(`${userAppInstallFailurePrefix}${installingUser.login}`);
            if (existingInstallErrorInfo) {
                await deleteUser(`${userAppInstallFailurePrefix}${installingUser.login}`);
                console.log(`Deleted placeholder error info for ${installingUser.login} - Error: ${JSON.stringify(existingInstallErrorInfo)}`);
            }
        } finally {
            console.log(`Installation data deleted from Boost GitHub Database for account: ${installingUser.login} by ${sender}`);
            await sendMonitoringEmail(`GitHub App Deleted ${targetType}: ${installingUser.login}`,
                `Installation data deleted from Boost GitHub Database\n` +
                `\t* Type: ${targetType}\n` +
                `\t* Account: ${installingUser.login}\n` +
                `\t* Requestor: ${sender}`);
        }
    } catch (error: any) {
        console.error(`Error deleting installation info from DynamoDB:`, error.callstack || error);
        await sendMonitoringEmail(`GitHub App Deletion Failure (${targetType}): ${installingUser.login}`,
            `Failed to delete installation data from Boost GitHub Database\n` +
            `\t* Date: ${usFormatter.format(new Date())}\n` +
            `\t* Type: ${targetType}\n` +
            `\t* Account: ${installingUser.login}\n` +
            `\t* Requestor: ${sender}\n` +
            `Error: ${JSON.stringify(error.stack || error)}`);
    }
}

async function handleInstallationChange(app: Probot, method: string, payload: any) {
    const startTimeOfInstallationCallbackInSeconds = new Date().getTime() / 1000;
    const installationId = payload.installation.id;
    const sender = payload.sender.login;
    const installingUser = payload.installation.account; // Information about the user who installed the app
    const targetType = payload.installation.target_type; // Type of the account ("User" or "Organization")

    console.log("Installation Change: Payload:", JSON.stringify(payload));

    if (payload.action === "deleted") {
        
        await handleInstallationDelete(installingUser, targetType, sender);

        return;
    }

    const retrievedUser : boolean = await getUserInformation(app, installationId, installingUser, sender, targetType);

    // don't log the repo info if we failed to get the user info, since we don't really have verified access
    //      so let's not put extra repo info in log
    if (!retrievedUser) {
        return;
    }
    await logRepoAccess(app, installationId, installingUser, targetType, payload, startTimeOfInstallationCallbackInSeconds);

}

async function getAccountName(app: Probot, installationId: number, sender: string, installingUser: any): Promise<string | undefined> {
    const existingAccount = await getAccountByUsername(installingUser.login);
    // if we have an email address for the account, then return that
    if (existingAccount !== undefined && existingAccount.account) {
        console.info(`Found existing account info for Username ${installingUser.login}: ${existingAccount.account}`);
        return existingAccount.account;
    }

    const octokit = await app.auth(installationId);

    console.log(`${installingUser.login}:users.getByUsername lookup`);
    const userInfo = await octokit.rest.users.getByUsername({
        username: installingUser.login,
    });

    if (userInfo.data.email && userInfo.data.email !== '') {
        const userEmail = userInfo.data.email.toLowerCase();
        console.log(`User Installation: ${userInfo.data.login}, Email: ${userEmail}`);
        return userEmail;
    } else {
        let primaryEmail = '';
        try {
            // Fetch the list of emails for the authenticated user from github
            const response = await octokit.rest.users.listEmailsForAuthenticatedUser();
            const primaryEmailObj = response.data.find(emailObj => emailObj.primary && emailObj.verified);
            primaryEmail = primaryEmailObj?primaryEmailObj.email.toLowerCase():'';
        } catch (error: any) {
            console.warn(`Error fetching primary email for ${installingUser.login}:`, error.stack || error);
        }
        if (primaryEmail) {
            console.log(`Primary Verified email for ${installingUser.login}: ${primaryEmail}`);

            return primaryEmail;
        } else {
            console.error(`No public verified primary email found for: ${installingUser.login} by ${sender}`);
        }
    }
    return undefined;
}

async function getUserInformation(
    app: Probot,
    installationId: number,
    installingUser: any,
    sender: string,
    targetType: string) : Promise<boolean> {

    console.info(`getUserInformation: User: ${installingUser.login}, Type: ${targetType}, Installation: ${installationId}, Sender: ${sender}`)

    // Get user information, including email address
    try {
        // Determine if the installation is for a user or an organization
        if (targetType === 'Organization') {
            console.log(`Organization Installation: ${installingUser.login}`);
            await saveUser(installingUser.login, installingUser.login,
                `${sender} Added Organization at ${usFormatter.format(new Date())}`,
                installationId.toString(), sender,);
            console.log(`Installation data saved to DynamoDB for Organization: ${installingUser.login}`);

            try {
                // see if we can find the admin/email of the org - the person who just installed it
                const userInfoForOrgAdmin = await getAccountByUsername(sender);
                if (!userInfoForOrgAdmin) {
                    console.error(`No user info found for Organization Installer/Admin: ${installingUser.login}`);
                } else if (userInfoForOrgAdmin.account!.includes('@')) {
                    await sendOrganizationWelcomeEmail(userInfoForOrgAdmin.account!, installingUser.login, sender);
                }
            } finally {
                await sendMonitoringEmail(`GitHub App Installation: Organization: ${installingUser.login}`,
                    `Installation data saved to Boost GitHub Database for Organization: ${installingUser.login}\n` +
                    `\t* Date: ${usFormatter.format(new Date())}\n` +
                    `\t* Requestor: ${sender}`);
            }
        } else if (targetType === 'User') {
            const accountName = await getAccountName(app, installationId, sender, installingUser);

            if (!accountName) {
                await saveUser(`${userAppInstallFailurePrefix}${installingUser.login}`, installingUser.login,
                    `No verified primary email found for: ${installingUser.login} by ${sender} at ${usFormatter.format(new Date())}`,
                    installationId.toString(), sender);

                console.error(`No verified primary email found for: ${installingUser.login} by ${sender}`);

                await sendMonitoringEmail(`GitHub App Installation Failure: No Primary Email: ${installingUser.login}`,
                    `Failed to get primary email for installation\n` +
                    `\t* Date: ${usFormatter.format(new Date())}\n` +
                    `\t* Requestor: ${sender}\n` +
                    `\t* Account: ${installingUser.login}`);
            } else {
                await saveUser(accountName, installingUser.login,
                    `${sender} Added User at ${usFormatter.format(new Date())}`,
                    installationId.toString(), sender);

                try {
                    await sendWelcomeEmail(accountName, installingUser.login, sender);
                    
                    // delete any placeholder error info for this user
                    const installErrorInfo = await getUser(`${userAppInstallFailurePrefix}${installingUser.login}`);
                    if (installErrorInfo) {
                        await deleteUser(`${userAppInstallFailurePrefix}${installingUser.login}`);
                        console.info(`Deleted placeholder error info for ${installingUser.login} - Error: ${JSON.stringify(installErrorInfo)}`);
                    }

                } finally {
                    console.log(`Installation data saved to DynamoDB for ${accountName}: Username: ${installingUser.login} by ${sender}`);
                    await sendMonitoringEmail(`GitHub App Installation: Account: ${accountName}`,
                        `Installation data saved to Boost GitHub Database for Account: ${accountName}\n` +
                        `\t* Date: ${usFormatter.format(new Date())}\n` +
                        `\t* Username: ${installingUser.login}\n` +
                        `\t* Requestor: ${sender}`);
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
            `\t* Requestor: ${sender}\n` +
            `\t* Account: ${installingUser.login}\n` +
            `\t* Error: ${JSON.stringify(error.stack || error)}`);
        return false;
    }
}

async function sendOrganizationWelcomeEmail(accountEmail: string, installingOrg: string, sender: string) {
    const imageUrl = "https://boost.polyverse.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2FSara_Cartoon_Portrait.80bf5621.png&w=256&q=75";
    const subject = `Sara is ready to help ${installingOrg} with software projects!`;
    const htmlBody = `
        <html>
            <body>
                <p><a href="https://github.com/apps/polyverse-boost">Boost GitHub App</a> by <a href="http://www.polyverse.com">Polyverse</a> has been installed for GitHub.com Repository Organization ${installingOrg} by ${sender} at ${usFormatter.format(new Date())}</p>
                <img src="${imageUrl}" alt="Sara AI Architect" />
                <p>Sara the AI Architect is now ready to partner with your organization, ${installingOrg}, on your software projects.</p>
                <p><a href="http://boost.polyverse.com/">http://boost.polyverse.com/</a></p>
                <p></p>
                <p>Sara can now access all of the private repositories in your organization to help your team analyze the code achieve their most critical Goals and Tasks on ${installingOrg}'s software projects.</p>
                <p></p>
                <p>Please let us know if you have any questions or need assistance by contacting <a href="mailto:support@polyverse.com">support@polyverse.com</a>.</p>
                <p>Thank you for using Sara with Boost AI by Polyverse and Happy Coding from the Polyverse team!</p>
            </body>
        </html>
    `;

    const plainTextBody = `Boost GitHub App has been installed for GitHub.com Repository Organization ${installingOrg} by ${sender} at ${usFormatter.format(new Date())}\n` +
        `\n` +
        `\n` +
        `Sara the AI Architect is now ready to partner with your organization, ${installingOrg}, on your software projects.\n` +
        `http://boost.polyverse.com/\n` +
        `\n` +
        `Sara can now access all of the private repositories in your organization to help your team analyze the code achieve their most critical Goals and Tasks on ${installingOrg}'s software projects.\n` +
        `\n` +
        `Please let us know if you have any questions or need assistance by contacting support@polyverse.com.\n` +
        `Thank you for using Sara with Boost AI by Polyverse and Happy Coding from the Polyverse team!`;

    // Send a welcome email to the organization
    await sendHtmlEmail(subject, htmlBody, plainTextBody, accountEmail, PolyverseSupportEmail);
}

async function sendWelcomeEmail(accountEmail: string, installingUsername: string, sender: string) {

    const imageUrl = "https://boost.polyverse.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2FSara_Cartoon_Portrait.80bf5621.png&w=256&q=75";
    const subject = `Sara is ready to help you with your software projects!`;
    const htmlBody = `
        <html>
            <body>
                <p><a href="https://github.com/apps/polyverse-boost">Boost GitHub App</a> by <a href="http://www.polyverse.com">Polyverse</a> has been installed for GitHub.com User ${installingUsername} by ${sender} at ${usFormatter.format(new Date())}</p>
                <img src="${imageUrl}" alt="Sara AI Architect" />
                <p>Sara the AI Architect is now ready to partner with you on your software projects.</p>
                <p><a href="http://boost.polyverse.com/">http://boost.polyverse.com/</a></p>
                <p></p>
                <p>Sara can now help you analyze private GitHub.com repositories that you have access to, and achieve your most critical Goals and Tasks on your software projects.</p>
                <p></p>
                <p>Please let us know if you have any questions or need assistance by contacting <a href="mailto:support@polyverse.com">support@polyverse.com</a>.</p>
                <p>Thank you for using Sara with Boost AI by Polyverse and Happy Coding from the Polyverse team!</p>
            </body>
        </html>
    `;
    const plainTextBody = `Boost GitHub App has been installed for GitHub.com User ${installingUsername} by ${sender} at ${usFormatter.format(new Date())}\n` +
        `\n` +
        `\n` +
        `Sara the AI Architect is now ready to partner with you on your software projects.\n` +
        `http://boost.polyverse.com/\n` +
        `\n` +
        `Sara can now help you analyze private GitHub.com repositories that you have access to, and achieve your most critical Goals and Tasks on your software projects.\n` +
        `\n` +
        `Please let us know if you have any questions or need assistance by contacting support@polyverse.com.\n`;
        `Thank you for using Sara with Boost AI by Polyverse and Happy Coding from the Polyverse team!`;

    // Send a welcome email to the user
    await sendHtmlEmail(subject, htmlBody, plainTextBody, accountEmail, PolyverseSupportEmail);
}

async function sendDepartureEmail(accountEmail: string, installingUsername: string, sender: string) {
    
    const imageUrl = "https://boost.polyverse.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2FSara_Cartoon_Portrait.80bf5621.png&w=256&q=75";

    const subject = `Sara is sad to see you go!`;
    const htmlBody = `
        <html>
            <body>
                <p><a href="https://github.com/apps/polyverse-boost">Boost GitHub App</a> by <a href="http://www.polyverse.com">Polyverse</a> has been uninstalled for GitHub.com User ${installingUsername} by ${sender} at ${usFormatter.format(new Date())}</p>
                <img src="${imageUrl}" alt="Sara AI Architect" />
                <p>Sara the AI Architect no longer has access to your software projects.</p>
                <p><a href="http://boost.polyverse.com/">http://boost.polyverse.com/</a></p>
                <p></p>
                <p>Sara would still love to help you analyze private GitHub.com repositories that you have access to, and achieve your most critical Goals and Tasks on your software projects.</p>
                <p></p>
                <p>If you would still like to use Sara with Boost AI by Polyverse, please reinstall the <a href="https://github.com/apps/polyverse-boost">Polyverse Boost app</a> from the GitHub Marketplace.</p>
                <p>If you are having any issues with Sara or your account or GitHub repository access, please contact us right away at <a href="mailto:support@polyverse.com">support@polyverse.com</a>.</p>
                <p>Sara and the entire Polyverse Team are ready to help when you are ready to use Sara with Boost AI again!</p>
                <p>
                <p>Thank you for using Sara with Boost AI by Polyverse and Happy Coding from the Polyverse team!</p>
            </body>
        </html>
    `;

    const plainTextBody = `Boost GitHub App has been uninstalled for GitHub.com User ${installingUsername} by ${sender} at ${usFormatter.format(new Date())}\n` +
        `\n` +
        `\n` +
        `Sara the AI Architect no longer has access to your software projects.\n` +
        `http://boost.polyverse.com/\n` +
        `\n` +
        `Sara would still love to help you analyze private GitHub.com repositories that you have access to, and achieve your most critical Goals and Tasks on your software projects.\n` +
        `\n` +
        `If you would still like to use Sara with Boost AI by Polyverse, please reinstall the Polyverse Boost app from the GitHub Marketplace.\n` +
        `If you are having any issues with Sara or your account or GitHub repository access, please contact us right away at support@polyverse.com.\n` +
        `Sara and the entire Polyverse Team are ready to help when you are ready to use Sara with Boost AI again!\n` +
        `\n` +
        `Thank you for using Sara with Boost AI by Polyverse and Happy Coding from the Polyverse team!`;

    // Send a departure email to the user
    await sendHtmlEmail(subject, htmlBody, plainTextBody, accountEmail, PolyverseSupportEmail);
}

async function sendOrganizationDepartureEmail(accountEmail: string, installingOrg: string, sender: string) {
    const imageUrl = "https://boost.polyverse.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2FSara_Cartoon_Portrait.80bf5621.png&w=256&q=75";

    const subject = `Sara is sad to see you go!`;
    const htmlBody = `
        <html>
            <body>
                <p><a href="https://github.com/apps/polyverse-boost">Boost GitHub App</a> by <a href="http://www.polyverse.com">Polyverse</a> has been uninstalled for GitHub.com Organization ${installingOrg} by ${sender} at ${usFormatter.format(new Date())}</p>
                <img src="${imageUrl}" alt="Sara AI Architect" />
                <p>Sara the AI Architect no longer has access to the software projects/repositories for ${installingOrg}.</p>
                <p><a href="http://boost.polyverse.com/">http://boost.polyverse.com/</a></p>
                <p></p>
                <p>Sara would still love to help you analyze private GitHub.com repositories that you have access to, and achieve your organiation's most critical Goals and Tasks on your software projects.</p>
                <p></p>
                <p>If you would still like to use Sara with Boost AI by Polyverse, please reinstall the <a href="https://www.github.com/apps/polyverse-boost">Polyverse Boost app</a> from the GitHub Marketplace.</p>
                <p>If you are having any issues with Sara or your account or GitHub repository access, please contact us right away at <a href="mailto:support@polyverse.com">support@polyverse.com</a>.</p>
                <p>Sara and the entire Polyverse Team are ready to help when your organization is ready to use Sara with Boost AI again!</p>
                <p></p>
                <p>Thank you for using Sara with Boost AI by Polyverse and Happy Coding from the Polyverse team!</p>`;
    const plainTextBody = `Boost GitHub App has been uninstalled for GitHub.com Organization ${installingOrg} by ${sender} at ${usFormatter.format(new Date())}\n` +
        `\n` +
        `\n` +
        `Sara the AI Architect no longer has access to the software projects/repositories for ${installingOrg}.\n` +
        `http://boost.polyverse.com/\n` +
        `\n` +
        `Sara would still love to help you analyze private GitHub.com repositories that you have access to, and achieve your organiation's most critical Goals and Tasks on your software projects.\n` +
        `\n` +
        `If you would still like to use Sara with Boost AI by Polyverse, please reinstall the Polyverse Boost app from the GitHub Marketplace.\n` +
        `If you are having any issues with Sara or your account or GitHub repository access, please contact us right away at support@polyverse.com.\n` +
        `Sara and the entire Polyverse Team are ready to help when your organization is ready to use Sara with Boost AI again!\n` +
        `\n` +
        `Thank you for using Sara with Boost AI by Polyverse and Happy Coding from the Polyverse team!`;

    // Send a departure email to the organization
    await sendHtmlEmail(subject, htmlBody, plainTextBody, accountEmail, PolyverseSupportEmail);
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
