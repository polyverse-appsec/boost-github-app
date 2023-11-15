const AWS = require('aws-sdk');

const secretStore = 'boost/GitHubApp';

async function getSecrets(secretName, region = 'us-west-2') {
    const client = new AWS.SecretsManager({ region });
    try {
        const rawSecretData = await client.getSecretValue({ SecretId: secretStore }).promise();
        const secretObject = JSON.parse(rawSecretData.SecretString);
        return secretObject[secretName];
    } catch (err) {
        console.error(`Error retrieving secrets from ${secretName}:`, err);
        throw err;
    }
}

module.exports = { getSecrets };
