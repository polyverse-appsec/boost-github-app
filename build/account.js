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
exports.deleteInstallationInfo = exports.saveInstallationInfo = exports.getInstallationInfo = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client = new client_dynamodb_1.DynamoDBClient({ region: "us-west-2" });
const dynamoDB = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
const installationsKeyValueStore = 'Boost.GitHub-App.installations';
function getInstallationInfo(accountName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const params = {
                TableName: installationsKeyValueStore,
                Key: {
                    account: accountName
                }
            };
            const { Item } = yield dynamoDB.send(new lib_dynamodb_1.GetCommand(params));
            if (Item) {
                return { installationId: Item.installationId, username: Item.username };
            }
        }
        catch (error) {
            console.error(`Error retrieving installation user info:`, error);
        }
        return undefined;
    });
}
exports.getInstallationInfo = getInstallationInfo;
function saveInstallationInfo(accountName, installationId, username) {
    return __awaiter(this, void 0, void 0, function* () {
        const params = {
            TableName: installationsKeyValueStore,
            Item: {
                account: accountName,
                installationId,
                username,
            },
        };
        yield dynamoDB.send(new lib_dynamodb_1.PutCommand(params));
    });
}
exports.saveInstallationInfo = saveInstallationInfo;
function deleteInstallationInfo(username, isOrg) {
    return __awaiter(this, void 0, void 0, function* () {
        const queryParams = {
            TableName: installationsKeyValueStore,
            IndexName: 'username-index',
            KeyConditionExpression: 'username = :username',
            ExpressionAttributeValues: {
                ':username': username
            },
            ProjectionExpression: 'account'
        };
        try {
            let accountName = username;
            if (!isOrg) {
                const { Items } = yield dynamoDB.send(new lib_dynamodb_1.QueryCommand(queryParams));
                if (!Items || Items.length === 0) {
                    console.log(`No installation info found for username: ${username}`);
                    return;
                }
                accountName = Items[0].account;
            }
            const deleteParams = {
                TableName: installationsKeyValueStore,
                Key: {
                    account: accountName
                }
            };
            yield dynamoDB.send(new lib_dynamodb_1.DeleteCommand(deleteParams));
            console.log(`Successfully deleted installation info for account: ${accountName}`);
        }
        catch (error) {
            console.error(`Error in processing deletion:`, error);
        }
    });
}
exports.deleteInstallationInfo = deleteInstallationInfo;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjb3VudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9hY2NvdW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBb0g7QUFFcEgsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFDM0QsTUFBTSxRQUFRLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBRXJELE1BQU0sMEJBQTBCLEdBQUcsZ0NBQWdDLENBQUM7QUFPcEUsU0FBc0IsbUJBQW1CLENBQUMsV0FBbUI7O1FBQ3pELElBQUksQ0FBQztZQUNELE1BQU0sTUFBTSxHQUFHO2dCQUNYLFNBQVMsRUFBRSwwQkFBMEI7Z0JBQ3JDLEdBQUcsRUFBRTtvQkFDRCxPQUFPLEVBQUUsV0FBVztpQkFDdkI7YUFDSixDQUFDO1lBRUYsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLHlCQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUU3RCxJQUFJLElBQUksRUFBRSxDQUFDO2dCQUNQLE9BQU8sRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQzVFLENBQUM7UUFDTCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNiLE9BQU8sQ0FBQyxLQUFLLENBQUMsMENBQTBDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDckUsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ3JCLENBQUM7Q0FBQTtBQWxCRCxrREFrQkM7QUFFRCxTQUFzQixvQkFBb0IsQ0FBQyxXQUFtQixFQUFFLGNBQXNCLEVBQUUsUUFBZ0I7O1FBQ3BHLE1BQU0sTUFBTSxHQUFHO1lBQ1gsU0FBUyxFQUFFLDBCQUEwQjtZQUNyQyxJQUFJLEVBQUU7Z0JBQ0YsT0FBTyxFQUFFLFdBQVc7Z0JBQ3BCLGNBQWM7Z0JBQ2QsUUFBUTthQUNYO1NBQ0osQ0FBQztRQUNGLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLHlCQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUNoRCxDQUFDO0NBQUE7QUFWRCxvREFVQztBQUVELFNBQXNCLHNCQUFzQixDQUFDLFFBQWdCLEVBQUUsS0FBYzs7UUFDekUsTUFBTSxXQUFXLEdBQUc7WUFDaEIsU0FBUyxFQUFFLDBCQUEwQjtZQUNyQyxTQUFTLEVBQUUsZ0JBQWdCO1lBQzNCLHNCQUFzQixFQUFFLHNCQUFzQjtZQUM5Qyx5QkFBeUIsRUFBRTtnQkFDdkIsV0FBVyxFQUFFLFFBQVE7YUFDeEI7WUFDRCxvQkFBb0IsRUFBRSxTQUFTO1NBQ2xDLENBQUM7UUFFRixJQUFJLENBQUM7WUFDRCxJQUFJLFdBQVcsR0FBRyxRQUFRLENBQUM7WUFDM0IsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNULE1BQU0sRUFBRSxLQUFLLEVBQUUsR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSwyQkFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JFLElBQUksQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDL0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0Q0FBNEMsUUFBUSxFQUFFLENBQUMsQ0FBQztvQkFDcEUsT0FBTztnQkFDWCxDQUFDO2dCQUNELFdBQVcsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1lBQ25DLENBQUM7WUFFRCxNQUFNLFlBQVksR0FBRztnQkFDakIsU0FBUyxFQUFFLDBCQUEwQjtnQkFDckMsR0FBRyxFQUFFO29CQUNELE9BQU8sRUFBRSxXQUFXO2lCQUN2QjthQUNKLENBQUM7WUFFRixNQUFNLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSw0QkFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7WUFDckQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1REFBdUQsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUN0RixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNiLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUQsQ0FBQztJQUNMLENBQUM7Q0FBQTtBQWxDRCx3REFrQ0MifQ==