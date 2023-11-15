const { createNodeMiddleware, Probot } = require('probot');
const serverless = require('serverless-http');
const { getSecrets } = require('./secrets');
const { Octokit } = require("@octokit/rest");
const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const installationsKeyValueStore = 'Boost.GitHub-App.installations';

const appFn = (app ) => {
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

    /*
    // Define the '/get_file_from_url' route using Probot's router
    const router = getRouter('/api');
    app.get('/get_file_from_url', async (req, res, next) => {
        try {
            const githubUrl = req.query.url;
            const parsedUrl = new URL(githubUrl);
            const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    
            // Basic URL validation
            if (pathParts.length < 4 || parsedUrl.hostname !== 'github.com') {
                return res.status(400).send('Invalid GitHub URL');
            }
    
            // Extract org/user, repo, and file path
            const [org, repo, , ...filePath] = pathParts;
            const fullPath = filePath.join('/');
    
            // Initialize Octokit for public access
            const publicOctokit = new Octokit();
    
            try {
                // First, try to retrieve the file using public access
                const fileContent = await publicOctokit.rest.repos.getContent({
                    owner: org,
                    repo,
                    path: fullPath
                });
    
                console.log(`Public file content for ${githubUrl}:`, fileContent.data);
                return res.json(fileContent.data);
            } catch (publicError) {
                console.log("Public access failed, trying authenticated access...");
    
                // Retrieve the email from the request
                const userEmail = req.query.email;
                if (!userEmail) {
                    return res.status(400).send('Email address is required');
                }

                // Lookup the installationId based on the email
                const queryParams = {
                    TableName: installationsKeyValueStore,
                    Key: { email: userEmail },
                };

                let installationId;
                try {
                    const data = await dynamodb.get(queryParams).promise();
                    installationId = data.Item ? data.Item.installationId : null;

                    if (!installationId) {
                        return res.status(404).send('Installation ID not found for provided email');
                    }
                } catch (dbError) {
                    console.error('Error retrieving installation ID from DynamoDB:', dbError);
                    return res.status(500).send('Failed to retrieve installation information');
                }    
                const authenticatedOctokit = await app.auth(installationId);
    
                const fileContent = await authenticatedOctokit.rest.repos.getContent({
                    owner: org,
                    repo,
                    path: fullPath
                });
    
                console.log(`Authenticated file content for ${githubUrl}:`, fileContent.data);
                res.json(fileContent.data);
            }
        } catch (error) {
            console.error('Error retrieving file:', error);
            res.status(500).send('Error retrieving file');
        }
        
    });
    */
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
