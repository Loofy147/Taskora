# Security policy

## Reporting a vulnerability

Do not disclose suspected vulnerabilities in public issues or discussions.

Use GitHub's private vulnerability reporting for this repository if it is enabled:
https://github.com/Loofy147/Taskora/security/advisories/new

If private reporting is unavailable, contact the repository maintainer privately through GitHub rather than publishing exploit details.

Include the affected commit or version, a concise impact description, reproduction steps, and a suggested mitigation where practical. Do not include real credentials, access tokens, personal data, or production business records in reports or test fixtures.

## Current security boundary

The current application baseline is a prototype. Browser-local task state is not a server-enforced workspace boundary. Do not treat local UI state, sample identities, or client-side checks as authorization. Shared persistence, authenticated membership, attachment storage, and cross-workspace access controls require implementation and verification before handling sensitive business data.
