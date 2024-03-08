"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const probot_1 = require("probot");
const serverless_http_1 = __importDefault(require("serverless-http"));
const secrets_1 = require("./secrets");
const account_1 = require("./account");
console.log(`App version: ${process.env.APP_VERSION}`);
const appFn = (app) => {
    app.on(['installation', 'installation_repositories'], (context) => __awaiter(void 0, void 0, void 0, function* () {
        // Assuming context.payload is already parsed JSON in TypeScript version
        yield handleInstallationChange(app, context.name, context.payload);
    }));
};
const maximumInstallationCallbackDurationInSeconds = 20;
function handleInstallationChange(app, method, payload) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const startTimeOfInstallationCallbackInSeconds = new Date().getTime() / 1000;
        const installationId = payload.installation.id;
        const installingUser = payload.installation.account; // Information about the user who installed the app
        const targetType = payload.installation.target_type; // Type of the account ("User" or "Organization")
        console.log("Installation Change: Payload:", JSON.stringify(payload));
        if (payload.action === "deleted") {
            // Call the function to delete installation info from DynamoDB
            try {
                // delete the data from DynamoDB to immediately block further access to GitHub by Boost backend
                yield (0, account_1.deleteInstallationInfo)(installingUser.login, targetType === 'Organization');
                console.log(`Installation data deleted from DynamoDB for account: ${installingUser.login}`);
            }
            catch (error) {
                console.error(`Error deleting installation info from DynamoDB:`, error);
            }
            return;
        }
        // Get user information, including email address
        try {
            const octokit = yield app.auth(installationId);
            const userInfo = yield octokit.rest.users.getByUsername({
                username: installingUser.login,
            });
            // Determine if the installation is for a user or an organization
            if (targetType === 'Organization') {
                console.log(`Organization Installation: ${installingUser.login}`);
                yield (0, account_1.saveInstallationInfo)(installingUser.login, installationId, installingUser.login);
                console.log(`Installation data saved to DynamoDB for Organization: ${installingUser.login}`);
            }
            else if (targetType === 'User') {
                const userInfo = yield octokit.rest.users.getByUsername({
                    username: installingUser.login,
                });
                if (userInfo.data.email) {
                    const userEmail = userInfo.data.email.toLowerCase();
                    console.log(`User Installation: ${userInfo.data.login}, Email: ${userEmail}`);
                    yield (0, account_1.saveInstallationInfo)(userEmail, installationId, userInfo.data.login);
                    console.log(`Installation data saved to DynamoDB for User: ${userEmail}`);
                }
                else {
                    // Fetch the list of emails for the authenticated user
                    const response = yield octokit.rest.users.listEmailsForAuthenticatedUser();
                    const primaryEmailObj = response.data.find(emailObj => emailObj.primary && emailObj.verified);
                    if (primaryEmailObj) {
                        const primaryEmail = primaryEmailObj.email.toLowerCase();
                        console.log(`Primary email for ${installingUser.login}: ${primaryEmail}`);
                        yield (0, account_1.saveInstallationInfo)(primaryEmail, installationId, installingUser.login);
                        console.log(`Installation data saved to DynamoDB for User: ${primaryEmail}`);
                    }
                    else {
                        console.error(`No verified primary email found for: ${installingUser.login}`);
                    }
                    console.error(`User installation but no email info found for: ${installingUser.login}`);
                }
            }
        }
        catch (error) {
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
            const octokit = yield app.auth(installationId);
            try {
                // Fetch repository details to get the default branch
                const repoDetails = yield octokit.rest.repos.get({
                    owner: installingUser.login,
                    repo: repo
                });
                const privateRepo = repoDetails.data.private ? repoDetails.data.private : false;
                const sizeOfRepo = repoDetails.data.size ? repoDetails.data.size : 0;
                console.log(`Repo Access Granted for ${targetType} Repo: ${installingUser.login}: ${repo.name} (${privateRepo ? "Private" : "Public"}, Size: ${sizeOfRepo} kb)`);
            }
            catch (error) {
                if (error.status === 404) {
                    console.warn(`${targetType} Repo may be empty - reporting not found: ${installingUser.login}: ${repo.name}`);
                }
                else if ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) {
                    console.error(`Error checking ${targetType} Repo Access for ${installingUser.login}: ${repo.name}:`, error.response.data);
                }
                else {
                    console.error(`Error checking ${targetType} Repo Access for ${installingUser.login}: ${repo.name}:`, (error.stack || error));
                }
            }
        }
    });
}
const BoostGitHubAppId = "472802";
const secretStore = 'boost/GitHubApp';
const secretKeyPrivateKey = `${secretStore}/private-key`;
const secretKeyWebhook = `${secretStore}/webhook`;
const initProbotApp = () => __awaiter(void 0, void 0, void 0, function* () {
    // Fetching secrets using AWS SDK v3
    const privateKey = yield (0, secrets_1.getSecret)(secretKeyPrivateKey);
    const webhookSecret = yield (0, secrets_1.getSecret)(secretKeyWebhook);
    process.env.PRIVATE_KEY = privateKey;
    process.env.WEBHOOK_SECRET = webhookSecret;
    const probot = new probot_1.Probot({
        appId: BoostGitHubAppId,
        privateKey: process.env.PRIVATE_KEY,
        secret: process.env.WEBHOOK_SECRET,
    });
    const middleware = (0, probot_1.createNodeMiddleware)(appFn, { probot });
    return (0, serverless_http_1.default)(middleware);
});
// AWS Lambda handler
const handler = (event, context) => __awaiter(void 0, void 0, void 0, function* () {
    const probotServer = yield initProbotApp();
    return probotServer(event, context);
});
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2FwcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7QUFBQSxtQ0FBc0Q7QUFDdEQsc0VBQXlDO0FBQ3pDLHVDQUFzQztBQUN0Qyx1Q0FBeUU7QUFFekUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBRXZELE1BQU0sS0FBSyxHQUFHLENBQUMsR0FBVyxFQUFFLEVBQUU7SUFDMUIsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLGNBQWMsRUFBRSwyQkFBMkIsQ0FBQyxFQUFFLENBQU8sT0FBTyxFQUFFLEVBQUU7UUFDcEUsd0VBQXdFO1FBQ3hFLE1BQU0sd0JBQXdCLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZFLENBQUMsQ0FBQSxDQUFDLENBQUM7QUFDUCxDQUFDLENBQUM7QUFFRixNQUFNLDRDQUE0QyxHQUFHLEVBQUUsQ0FBQztBQUV4RCxTQUFlLHdCQUF3QixDQUFDLEdBQVcsRUFBRSxNQUFjLEVBQUUsT0FBWTs7O1FBQzdFLE1BQU0sd0NBQXdDLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDN0UsTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7UUFDL0MsTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQyxtREFBbUQ7UUFDeEcsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsQ0FBQyxpREFBaUQ7UUFFdEcsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFFdEUsSUFB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