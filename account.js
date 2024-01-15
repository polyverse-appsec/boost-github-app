const dynamoDB = new AWS.DynamoDB.DocumentClient();

const installationsKeyValueStore = 'Boost.GitHub-App.installations';

export async function getInstallationInfo (accountName) {

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

export async function saveInstallationInfo (accountName, installationId, username) {
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