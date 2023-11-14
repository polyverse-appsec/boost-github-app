Polyverse Boost GitHub App
======================

# Release Notes

## Version 0.1.0: November 14th, 2023

### New Features
- get_file_from_url service API to retrieve a file from GitHub
- GitHub callback support when User Installs and App or creates a Repo (e.g. installation.created installation_repositories.added)
- Retrieves secrets stored in AWS for GitHub app private key and secure GitHub webhook validation

### Enhancements
- Retrieve public GitHub source files anonymously before trying a specific user
- GitHub usernames and emails are stored in AWS Dynamic for future GitHub file access

### Bug Fixes
- N/A
