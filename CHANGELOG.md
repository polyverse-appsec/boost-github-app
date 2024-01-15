Polyverse Boost GitHub App
======================

# Release Notes

## Version 0.3.0: January 14th, 2023

### New Features
- Add persistence of Installation info in AWS Dynamo

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
