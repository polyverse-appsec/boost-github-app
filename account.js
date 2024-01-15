const AWS = require('aws-sdk');

const dynamoDB = new AWS.DynamoDB.DocumentClient();

const installationsKeyValueStore = 'Boost.GitHub-App.installations';

async function getInstallationInfo (accountName) {

    // account can be either an email address for a user
    // or an org name for an organization installation

    let installationId;
    try {
        // load from DynamoDB
        const params = {
            TableName: installationsKeyValueStore,
            Key: {
                account: accountName // primary key is marked as email, though it may be org name
            }
        };

        const userInfo = await dynamoDB.get(params).promise();

        installationId = userInfo.Item.installationId;
        const installingUser = userInfo.Item.username;

        return { installationId: installationId, username: installingUser };
    } catch (error) {

        console.error(`Error retrieving installation user info:`, error);

        return undefined;
    }
}

async function saveInstallationInfo (accountName, installationId, username) {
    // Save to DynamoDB
    const params = {
        TableName: installationsKeyValueStore,
        Item: {
            account: accountName, // primary key is named email, but may be an org name for an org
            installationId: installationId,
            username: username,
        },
    };
    await dynamoDB.put(params).promise();
}

async function deleteInstallationInfo(username, isOrg) {
    // Query the Global Secondary Index to find the account
    const queryParams = {
        TableName: installationsKeyValueStore,
        IndexName: 'username-index',
        KeyConditionExpression: 'username = :username',
        ExpressionAttributeValues: {
            ':username': username
        },
        ProjectionExpression: 'account' // 'account' is the attribute for the email or org name
    };

    try {
        // we're going to lookup by username
        let accountName = username;

        // but if its not an org, we need to lookup the email - so we can find the username
        if (!isOrg) {
            const queryResult = await dynamoDB.query(queryParams).promise();
            if (queryResult.Items.length === 0) {
                console.log(`No installation info found for username: ${username}`);
                return;
            }

            // Assuming the first item's 'account' attribute contains the email
            accountName = queryResult.Items[0].account;
        }

        // Delete the item from the main table using the email
        const deleteParams = {
            TableName: installationsKeyValueStore,
            Key: {
                account: accountName
            }
        };

        await dynamoDB.delete(deleteParams).promise();
        console.log(`Successfully deleted installation info for account: ${accountName}`);
    } catch (error) {
        console.error(`Error in processing deletion:`, error);
    }
}

module.exports = {
    getInstallationInfo,
    saveInstallationInfo,
    deleteInstallationInfo
};