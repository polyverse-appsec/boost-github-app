const { Probot } = require('probot');
const express = require('express');
const serverless = require('serverless-http');

const appFn = (app) => {
    // Handle new installations
    app.on(['installation.created', 'installation_repositories.added'], async (context) => {
        const installationId = context.payload.installation.id;
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

    // Handler to retrieve a specific file using a GitHub URL
    app.route('/get_file_from_url').get(async (req, res) => {
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

            // TODO: Determine installationId based on the user/org
            const installationId = /* Your logic to get installation ID */;

            const octokit = await app.auth(installationId);

            const fileContent = await octokit.rest.repos.getContent({
                owner: org,
                repo,
                path: fullPath
            });

            res.json(fileContent.data);
        } catch (error) {
            console.error('Error retrieving file:', error);
            res.status(500).send('Error retrieving file');
        }
    });
};

const probot = new Probot({});
const app = express();
app.use(probot.load(appFn));

module.exports.handler = serverless(app);
