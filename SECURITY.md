# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.7.x   | :white_check_mark: |
| < 0.7   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in MyNetwork, please report it responsibly:

1. **Do NOT open a public GitHub issue** for security vulnerabilities.
2. **Email**: Send details to the maintainer via [GitHub private vulnerability reporting](https://github.com/Erreur32/MynetworK/security/advisories/new).
3. **Include**: A description of the vulnerability, steps to reproduce, and potential impact.

### What to expect

- **Acknowledgment** within 48 hours of your report.
- **Status update** within 7 days with an assessment and timeline.
- **Fix timeline**: Critical vulnerabilities will be patched within 14 days. Lower severity issues will be addressed in the next release cycle.
- **Credit**: Reporters will be credited in the release notes (unless they prefer to remain anonymous).

## Security Measures

This project uses:
- **CodeQL** static analysis on every push and PR
- **Dependency Review** on pull requests (fails on high severity)
- **Dependabot** for automated dependency updates
- **OpenSSF Scorecard** for supply chain security monitoring
- **Secret scanning** and `.gitignore` rules to prevent credential leaks

### Container Hardening
- `cap_drop: ALL` + targeted `NET_RAW`/`NET_ADMIN` for network scanning only
- `security_opt: no-new-privileges:true` to prevent privilege escalation
- No Docker socket mount (removed — prevents container escape)
- No full host filesystem mount (removed — only `/proc`, `/sys`, `/etc/hostname`, `/etc/hosts` mounted read-only)

### Application Security
- **Command injection prevention**: all shell commands use `execFile()` (array arguments, no shell) instead of `exec()` (string interpolation)
- **JWT blacklist persistence**: revoked tokens survive container restarts (SQLite-backed)
- **WebSocket rate limiting**: per-connection sliding window (50 msg/10s)
- **RBAC**: network scan operations restricted to admin role
- **Brute force protection**: login attempts rate-limited per username and IP
