const AWS = require('aws-sdk');

async function getSecrets(secretName, region = 'us-west-2') {
    const client = new AWS.SecretsManager({ region });
    try {
        const data = await client.getSecretValue({ SecretId: secretName }).promise();
        return JSON.parse(data.SecretString);
    } catch (err) {
        console.error(`Error retrieving secrets from ${secretName}:`, err);
        throw err;
    }
}

module.exports = { getSecrets };
