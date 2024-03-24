import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, UpdateCommandInput } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-west-2" });
const dynamoDB = DynamoDBDocument.from(client);

const githubAppUserKeyValueStore = 'Boost.GitHub-App.installations';
const reverseAccountLookupByUsernameSecondaryIndex = 'username-index';

interface UserInfo {
    account?: string;
    installationId?: string;
    username: string;
    owner?: string;
    details?: string;
    lastUpdated?: number;
    authToken?: string;
}

export async function getAccountByUsername(username: string): Promise<UserInfo | undefined> {
    try {
        const params = {
            TableName: githubAppUserKeyValueStore,
            IndexName: reverseAccountLookupByUsernameSecondaryIndex,
            KeyConditionExpression: 'username = :username',
            ExpressionAttributeValues: {
                ':username': username,
            },
        };

        const item = await dynamoDB.query(params);
        if (item.Items && item.Items.length > 0) {
            // look for user info where the account is an email address
            for (const user of item.Items) {
                if (user.account.includes('@')) {
                    return user as UserInfo;
                }
            }
        }
    } catch (error: any) {
        console.error(`Error retrieving user info by username:`, error.stack || error);
    }
    return undefined;
}

export async function getUser(accountName: string): Promise<UserInfo | undefined> {
    try {
        const params = {
            TableName: githubAppUserKeyValueStore,
            Key: {
                account: accountName
            }
        };

        const item = await dynamoDB.get(params);
        if (item.Item) {
            return item.Item as UserInfo;
        }
    } catch (error: any) {
        console.error(`Error retrieving user info:`, error.stack || error);
    }
    return undefined;
}

export async function saveUser(
    accountName: string,
    username: string,
    details: string,
    installationId?: string,
    owner?: string,
    authToken?: string): Promise<void> {
    try {
        // Build the update expression dynamically based on provided arguments
        let updateExpression = "set lastUpdated = :lastUpdated, username = :username, details = :details";
        let expressionAttributeValues: any = {
            ":lastUpdated": Math.round(Date.now() / 1000),
            ":username": username,
            ":details": details
        };

        if (installationId) {
            updateExpression += ", installationId = :installationId";
            expressionAttributeValues[":installationId"] = installationId;
        }
        if (owner) {
            updateExpression += ", owner = :owner";
            expressionAttributeValues[":owner"] = owner;
        }
        if (authToken) {
            updateExpression += ", authToken = :authToken";
            expressionAttributeValues[":authToken"] = authToken;
        }

        const updateParams = {
            TableName: githubAppUserKeyValueStore,
            Key: { account: accountName },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: "UPDATED_NEW"
        } as UpdateCommandInput;

        await dynamoDB.update(updateParams);
        console.log(`Successfully updated user info for account: ${accountName}`);
    } catch (error: any) {
        console.error(`Error saving user info for account: ${accountName}`, error.stack || error);
    }
}

export async function deleteUserByUsername(username: string, requestor: string, deleteInstallationInfoOnly: boolean = false): Promise<void> {
    try {
        // Query to find all accounts associated with the username
        //      - This is necessary because the username is not the primary key
        //      And there may be placeholder accounts missing the known primary email key
        const queryResult = await dynamoDB.query({
            TableName: githubAppUserKeyValueStore,
            IndexName: reverseAccountLookupByUsernameSecondaryIndex,
            KeyConditionExpression: 'username = :username',
            ExpressionAttributeValues: {
                ':username': username,
            },
        });

        // If there are matching items, delete each one by its account name
        if (!queryResult.Items || queryResult.Items.length === 0) {
            console.log(`No user info found for username: ${username}`);
            return;
        }

        for (const item of queryResult.Items) {
            const accountName = item.account;
            if (deleteInstallationInfoOnly) {
                await updateUser(accountName, {
                    username: username,
                    installationId: "",
                    details: `Installation info deleted for username: ${username} by ${requestor}`
                });
                console.log(`Successfully deleted installation info for account: ${accountName} for username: ${username}`);
            } else {
                try {
                    await dynamoDB.delete({
                        TableName: githubAppUserKeyValueStore,
                        Key: { account: accountName },
                    });
                    console.log(`Successfully deleted user info for account: ${accountName} for username: ${username}`);
                } catch (error: any) {
                    console.error(`Error in deleting user info for account: ${accountName} for username: ${username}`, error.stack || error);
                }
            }
        }
    } catch (error: any) {
        console.error(`Error in deleting user info for username: ${username}`, error.stack || error);
    }
}

export async function deleteUser(accountName: string): Promise<void> {
    try {
        await dynamoDB.delete({
            TableName: githubAppUserKeyValueStore,
            Key: { account: accountName },
        });
        console.log(`Successfully deleted user info for account: ${accountName}`);
    } catch (error: any) {
        console.error(`Error in deleting user info for accountName: ${accountName}`, error.stack || error);
    }
}

export async function updateUser(accountName: string, updatedInfo: UserInfo): Promise<void> {
    let updateExpression = "set lastUpdated = :lastUpdated";
    let expressionAttributeValues : any = {
        ":lastUpdated": Math.round(Date.now() / 1000),
    };
    let needsUpdate = false;

    // Dynamically add fields to update based on what's present in updatedInfo
    if ('authToken' in updatedInfo && updatedInfo.authToken !== undefined) {
        updateExpression += ", authToken = :authToken";
        expressionAttributeValues[":authToken"] = updatedInfo.authToken;
        needsUpdate = true;
    }
    if ('installationId' in updatedInfo && updatedInfo.installationId !== undefined) {
        updateExpression += ", installationId = :installationId";
        expressionAttributeValues[":installationId"] = updatedInfo.installationId;
        needsUpdate = true;
    }

    if ('details' in updatedInfo && updatedInfo.details !== undefined) {
        updateExpression += ", details = :details";
        expressionAttributeValues[":details"] = updatedInfo.details;
        needsUpdate = true;
    }

    if (!needsUpdate) {
        console.warn(`No updates needed for user info for account: ${accountName} - ${JSON.stringify(updatedInfo)}`);
        return;
    }

    try {
        const updateParams = {
            TableName: githubAppUserKeyValueStore,
            Key: { account: accountName },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues
        };

        await dynamoDB.update(updateParams);
        console.log(`Successfully updated user info for account: ${accountName} - ${JSON.stringify(updatedInfo)}`);
    } catch (error: any) {
        console.error(`Error in updating user info for account: ${accountName} - ${JSON.stringify(updatedInfo)}`, error.stack || error);
    }
}

