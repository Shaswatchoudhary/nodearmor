# Security Policy

## Supported Versions

We only support the latest version of `nodearmor`. If you find a security vulnerability, please upgrade to the latest version immediately to see if it has already been addressed.

| Version | Supported          |
| ------- | ------------------ |
| >= 1.5.x| :white_check_mark: |
| < 1.5.0 | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a potential security vulnerability in `nodearmor`, please report it by emailing the maintainer directly. We appreciate your help in keeping this project secure.

- **Email**: [Insert Email or use GitHub DM if applicable]
- **Response Time**: We aim to acknowledge receipt of your report within 48 hours and provide a fix or mitigation plan within 5-7 business days.

## Our Commitment to Security

`nodearmor` is designed with a **"Security-First"** philosophy:

1.  **Zero-Invention Architecture**: We do not reinvent cryptographic or validation algorithms. We provide a thin, type-safe, and opinionated layer over industry-standard libraries:
    - **Hashing**: Powered by `argon2` (C bindings to the reference implementation).
    - **Validation**: Powered by `zod` (the industry standard for TypeScript validation).
2.  **Safe Defaults**: We enforce OWASP-recommended parameters for Argon2id hashing by default.
3.  **Minimal Dependencies**: We keep our dependency tree as small as possible to minimize supply chain risks.
4.  **Transparency**: All code is open-source, and we use public auditing tools like `npm audit`.
