const { createNodeMiddleware, Probot } = require('probot');
const serverless = require('serverless-http');
const { getSecret } = require('./secrets');
const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const installationsKeyValueStore = 'Boost.GitHub-App.installations';

const appFn = (app ) => {
    // TODO: Need to handle installation deleted event (installation.deleted) and
    //      installation_repositories removed event (installation_repositories.removed)

    // Handle new installations
    app.on(['installation', 'installation_repositories', 'created'], async (context) => {
        if (Buffer.isBuffer(context.payload)) {
            context.payload = JSON.parse(context.payload.toString());
        } else if (typeof context.payload === 'string') {
            context.payload = JSON.parse(context.payload);
        }
        await handleNewInstallation(app, context.name, context.payload);

    });

};

async function handleNewInstallation(app, action, payload) {
    const installationId = payload.installation.id;
    const installingUser = payload.installation.account; // Information about the user who installed the app

    /* TODO: This doesn't work due to "Resource not accessible by integration"
    try {
        const octokit = await app.auth(installationId);
        const emails = await octokit.rest.users.listEmailsForAuthenticatedUser();
        console.log(`Installation User: ${installingUser.login}, Email: ${emails}`);
    } catch (error) {
        console.error(`Error retrieving installation user emails:`, error);
    }
    */

    // Get user information, including email address
    try {
        const octokit = await app.auth(installationId);
        const userInfo = await octokit.rest.users.getByUsername({
            username: installingUser.login,
        });
    
        if (userInfo.data.email) {
            const userEmail = userInfo.data.email;
            console.log(`Installation User: ${userInfo.data.login}, Email: ${userEmail}`);
    
            // Save to DynamoDB
            const params = {
                TableName: installationsKeyValueStore,
                Item: {
                    email: userEmail, // primary key
                    installationId: installationId,
                    username: userInfo.data.login,
                },
            };
    
            await dynamodb.put(params).promise();
            console.log('Installation data saved to DynamoDB');
        } else {
            console.log(`Installation User: ${userInfo.data.login}`);
            console.log(`Could not find email address for user ${userInfo.data.login}`)
        }

        // userInfo.data.email will contain the email address, if publicly available
        console.log(`Installation User: ${userInfo.data.login}, Email: ${userInfo.data.email}`);
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

            console.log(`Files in ${repo.name}:`, files.data);
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
    process.env.WEBHOOK_PROXY_URL = "https://smee.io/O4DBvTwAGVcjJHan";

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
