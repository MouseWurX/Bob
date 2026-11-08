# Security

Bob runs on your own PC and can read and change files there (with your approval), so security reports
are welcome.

**Reporting:** please use GitHub's private "Report a vulnerability" button on this repository (Security
tab). Don't open a public issue for a security problem. You should hear back within a week.

**In scope:** Bob's local server (it only answers on this PC, and on your own Tailscale network if you
turn that on), the approval prompts for file changes and cloud helpers, the secrets guard (files such as
keys, `.env` and keystores that Bob must never read), the installer and updater, and the release
downloads.

**Supported versions:** the latest release.
