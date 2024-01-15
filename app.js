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

async function handleInstallationChange(app, method, payload) {
    const installationId = payload.installation.id;
    const installingUser = payload.installation.account; // Information about the user who installed the app

    if (payload.action === "deleted") {
        // Call the function to delete installation info from DynamoDB
        try {
            console.log("Deletion request: Payload:", JSON.stringify(payload));

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
    
        if (userInfo.data.email) {
            const userEmail = userInfo.data.email.toLowerCase();
            console.log(`Installation User: ${userInfo.data.login}, Email: ${userEmail}`);

            await saveInstallationInfo(userEmail, installationId, userInfo.data.login);
            console.log(`Installation data saved to DynamoDB for account: ${userEmail}`);
        } else if (userInfo.data.login) {
            // we're going to assume a login with no email is an organization
            // and use the login as the email address / account name

            console.log(`${userInfo.data.login} has no email; assuming Organization; using login as account name`)

            await saveInstallationInfo(userInfo.data.login, installationId, userInfo.data.login);
            console.log(`Installation data saved to DynamoDB for account: ${userInfo.data.login}`);

        } else {
            console.error(`Installation User with no login or email info: ${installingUser.login}`);
        }
    } catch (error) {
        console.error(`Error retrieving installation user info:`, error);
    }
    const repositories = payload.repositories || payload.repositories_added;

    for (const repo of repositories) {
        const octokit = await app.auth(installationId);

        // List files in the repository
        try {
            const files = await octokit.rest.repos.getContent({
                owner: installingUser.login,
                repo: repo.name,
                path: '' // Root directory
            });

            // for debugging, we can dump file info to the console
            // console.log(`Files in ${repo.name}:`, files.data);

            console.log(`Repo Access Granted for: ${repo.name}`);

        } catch (error) {
            console.error(`Error accessing files in ${repo.name}:`, error);
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
