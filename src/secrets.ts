import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

interface SecretValueResponse {
    SecretString?: string;
}

export async function getSecrets(secretName: string, region: string = 'us-west-2'): Promise<Record<string, any>> {
    const client = new SecretsManagerClient({ region });
    try {
        const command = new GetSecretValueCommand({ SecretId: secretName });
        const rawSecretData = await client.send(command);
        if (rawSecretData.SecretString) {
            const secretObject: Record<string, any> = JSON.parse(rawSecretData.SecretString);
            return secretObject;
        }
        throw new Error('Secret string is undefined');
    } catch (err) {
        console.error(`Error retrieving secrets from ${secretName}:`, err);
        throw err;
    }
}

export async function getSecret(secretName: string, region: string = 'us-west-2'): Promise<string> {
    const client = new SecretsManagerClient({ region });
    try {
        const command = new GetSecretValueCommand({ SecretId: secretName });
        const rawSecretData = await client.send(command);
        if (rawSecretData.SecretString) {
            return rawSecretData.SecretString;
        }
        throw new Error('Secret string is undefined');
    } catch (err) {
        console.error(`Error retrieving secrets from ${secretName}:`, err);
        throw err;
    }
}
