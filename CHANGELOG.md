Polyverse Boost GitHub App
======================

# Release Notes

## Version 0.6.1: March 25th, 2024

### New Features
- N/A

### Enhancements
- N/A

### Bug Fixes
- N/A

## Version 0.6.0: March 25th, 2024

### New Features
- Welcome and Departure emails are sent from the Boost GitHub App install service to users and org admins directing to Sara website

### Enhancements
- Delete only the installation info for user accounts (to preserve the email primary key info)
- If a User fails to record installation due to missing email, then cleanup the failed installation record on App uninstall
- Reduce Service package size to 35mb (from 59mb)

### Bug Fixes
- N/A

## Version 0.5.0: March 21st, 2024

### New Features
- Email notifications to monitoring@polyverse.com for:
    - all GitHub App installations and deletions
    - all GitHub App errors reading user information
    Only enabled if EMAIL_NOTIFICATIONS env variable is set for host

### Enhancements
- Log full callstack if available for installation failures
- Don't log the Repos for an Organization or User if we fail to install the App (extra privacy in logs)
- Report the Sender of an Application Install (GitHub Username) so we know which User installed a GitHub App
- When Deleting an Install, add a Warning if the Delete Sender is not the same as the Install Sender

### Bug Fixes
- Fix issue with Users with private emails raising an error and failing to install their GitHub App
- Fix logging to avoid logging an ERROR when a successful User App installation completes

## Version 0.4.0: March 7th, 2024

### New Features
- N/A

### Enhancements
- Change default callback timeout from 6 seconds (default for Serverless) to 29 seconds - to accomodate large GitHub repo lists for new account installations
- Significant speed up of GitHub org and user installation by skipping file content count - and only looking if Repo is accessible
- Add a warning / guardrail in the Installation callback to ensure it completes within 20 seconds (if possible)
    - If running long, the specific Repo access checks will be bypassed (no functional impact to user or org access)
- Improved logging for empty repos being detected
- Move node.js version for App Host from v18 to v20
- Move all code to TypeScript and AWS JavaScript v3

### Bug Fixes
- N/A

## Version 0.3.1: February 16th, 2024

### New Features
- N/A

### Enhancements
- Enable GitHub App installation handler to retrieve primary/verified email address from GitHub API (not just email associated with Username)

### Bug Fixes
- N/A

## Version 0.3.0: January 14th, 2024

### New Features
- Add persistence of Installation info in AWS Dynamo
- Add Installation deletion when app is deleted/uninstalled by User or Organization
- Add Support for Organization installations - which have no email address

### Enhancements
- N/A

### Bug Fixes
- Fixed storage bug blocking Dynamo key save

## Version 0.2.0: December 4th, 2023

### New Features
- Added User library

### Enhancements
- N/A

### Bug Fixes
- N/A

## Version 0.1.2: November 16th, 2023

### New Features
- N/A

### Enhancements
- Enable Secret API to store full text blobs with embedded newlines (e.g. private keys)
- Raise Node.js runtime version from v14 to v18 (for AWS and perf and functionality)
- Added App version to log
- Store all emails in Boost accounst store as lower-case for case-insensitive matching and consistency
- Handle Installation deletions (e.g. User removes permission for Boost app) by logging and not accessing their data (account deletion is not supported)

### Bug Fixes
- Fix permission issue causing Lambda AWS crash when accessing DynamoDB and Secrets
- Remove warning on 'created' invalid Webhook name

## Version 0.1.1: November 15th, 2023

### New Features
- N/A

### Enhancements
- Enable Secret API to store full text blobs with embedded newlines (e.g. private keys)

### Bug Fixes
- Fix AWS provider encoded payloads
- Fixes for authentication issues with retrieving files and user info

## Version 0.1.0: November 14th, 2023

### New Features
- GitHub callback support when User Installs and App or creates a Repo (e.g. installation.created installation_repositories.added)
- Retrieves secrets stored in AWS for GitHub app private key and secure GitHub webhook validation

### Enhancements
- GitHub usernames and emails are stored in AWS Dynamo for future GitHub file access

### Bug Fixes
- N/A
