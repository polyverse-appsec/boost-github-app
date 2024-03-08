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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSecret = exports.getSecrets = void 0;
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
function getSecrets(secretName_1) {
    return __awaiter(this, arguments, void 0, function* (secretName, region = 'us-west-2') {
        const client = new client_secrets_manager_1.SecretsManagerClient({ region });
        try {
            const command = new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretName });
            const rawSecretData = yield client.send(command);
            if (rawSecretData.SecretString) {
                const secretObject = JSON.parse(rawSecretData.SecretString);
                return secretObject;
            }
            throw new Error('Secret string is undefined');
        }
        catch (err) {
            console.error(`Error retrieving secrets from ${secretName}:`, err);
            throw err;
        }
    });
}
exports.getSecrets = getSecrets;
function getSecret(secretName_1) {
    return __awaiter(this, arguments, void 0, function* (secretName, region = 'us-west-2') {
        const client = new client_secrets_manager_1.SecretsManagerClient({ region });
        try {
            const command = new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretName });
            const rawSecretData = yield client.send(command);
            if (rawSecretData.SecretString) {
                return rawSecretData.SecretString;
            }
            throw new Error('Secret string is undefined');
        }
        catch (err) {
            console.error(`Error retrieving secrets from ${secretName}:`, err);
            throw err;
        }
    });
}
exports.getSecret = getSecret;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjcmV0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9zZWNyZXRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLDRFQUE4RjtBQU05RixTQUFzQixVQUFVO3lEQUFDLFVBQWtCLEVBQUUsU0FBaUIsV0FBVztRQUM3RSxNQUFNLE1BQU0sR0FBRyxJQUFJLDZDQUFvQixDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUNwRCxJQUFJLENBQUM7WUFDRCxNQUFNLE9BQU8sR0FBRyxJQUFJLDhDQUFxQixDQUFDLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDcEUsTUFBTSxhQUFhLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2pELElBQUksYUFBYSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUM3QixNQUFNLFlBQVksR0FBd0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLENBQUM7Z0JBQ2pGLE9BQU8sWUFBWSxDQUFDO1lBQ3hCLENBQUM7WUFDRCxNQUFNLElBQUksS0FBSyxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFDbEQsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDWCxPQUFPLENBQUMsS0FBSyxDQUFDLGlDQUFpQyxVQUFVLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNuRSxNQUFNLEdBQUcsQ0FBQztRQUNkLENBQUM7SUFDTCxDQUFDO0NBQUE7QUFkRCxnQ0FjQztBQUVELFNBQXNCLFNBQVM7eURBQUMsVUFBa0IsRUFBRSxTQUFpQixXQUFXO1FBQzVFLE1BQU0sTUFBTSxHQUFHLElBQUksNkNBQW9CLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQztZQUNELE1BQU0sT0FBTyxHQUFHLElBQUksOENBQXFCLENBQUMsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztZQUNwRSxNQUFNLGFBQWEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDakQsSUFBSSxhQUFhLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQzdCLE9BQU8sYUFBYSxDQUFDLFlBQVksQ0FBQztZQUN0QyxDQUFDO1lBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1FBQ2xELENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ1gsT0FBTyxDQUFDLEtBQUssQ0FBQyxpQ0FBaUMsVUFBVSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDbkUsTUFBTSxHQUFHLENBQUM7UUFDZCxDQUFDO0lBQ0wsQ0FBQztDQUFBO0FBYkQsOEJBYUMifQ==