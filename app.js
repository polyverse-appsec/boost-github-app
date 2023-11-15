const { createNodeMiddleware, Probot } = require('probot');
const serverless = require('serverless-http');
const { getSecrets } = require('./secrets');
const { Octokit } = require("@octokit/rest");
const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const installationsKeyValueStore = 'Boost.GitHub-App.installations';

const appFn = (app ) => {
    // TODO: Need to handle installation deleted event (installation.deleted) and
    //      installation_repositories removed event (installation_repositories.removed)

    // Handle new installations
    app.on(['installation.created', 'installation_repositories.added'], async (context) => {
        const installationId = context.payload.installation.id;
        const installingUser = context.payload.installation.account; // Information about the user who installed the app
    
        const octokit = await app.auth(installationId);
    
        // Get user information, including email address
        try {
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
        const repositories = context.payload.repositories || context.payload.repositories_added;

        for (const repo of repositories) {
            const octokit = await app.auth(installationId);

            // List files in the repository
            try {
                const files = await octokit.rest.repos.getContent({
                    owner: repo.owner.login,
                    repo: repo.name,
                    path: '' // Root directory
                });

                console.log(`Files in ${repo.name}:`, files.data);
            } catch (error) {
                console.error(`Error accessing files in ${repo.name}:`, error);
            }
        }
    });
};

const BoostGitHubAppId = "472802";

const secretStore = 'boost/GitHubApp';

// Async function to initialize and start the Probot app
const initProbotApp = async () => {
    // Fetch secrets
    const appSecrets = await getSecrets(secretStore);

    // Set environment variables
    process.env.PRIVATE_KEY = appSecrets['githubapp-private'];
    process.env.WEBHOOK_SECRET = appSecrets['githubapp-webhook'];

    // Initialize Probot with the secrets
    const probot = new Probot({
        appId:BoostGitHubAppId,
        privateKey: appSecrets['githubapp-private'],
        secret: appSecrets['githubapp-webhook'],
    });
    await probot.load(appFn, { getRouter: () => null });
    const middleware = createNodeMiddleware(appFn, { probot });

    return serverless(middleware);
};

// AWS Lambda handler
module.exports.handler = async (event, context) => {
    const probotServer = await initProbotApp();
    return probotServer(event, context);
};
