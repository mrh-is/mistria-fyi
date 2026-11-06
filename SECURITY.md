# Security policy

## Supported versions

Only the latest deployed version of Mistria Field Guide receives security updates. There are no
long-term support branches.

| Version     | Supported |
| ----------- | --------- |
| Latest      | Yes       |
| All earlier | No        |

## Reporting a vulnerability

Please report security vulnerabilities **privately** by emailing
[michael@mistria.fyi](mailto:michael@mistria.fyi). Do not open a public issue for security reports.

Include as much detail as you can: what you found, how to reproduce it, and any potential impact.
You'll receive an acknowledgment within 72 hours, and I'll work with you to understand and address
the issue before any public disclosure.

The same contact & this policy are published at
[mistria.fyi/.well-known/security.txt](https://mistria.fyi/.well-known/security.txt)
([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)). Its source is
`static/.well-known/security.txt`; its `Expires` date needs a yearly refresh, and a test fails when
it is within 30 days.

## Scope

The following are in scope:

- The deployed application at [mistria.fyi](https://mistria.fyi)
- The source code in this repository
- The feedback submission endpoint
- Data handling and privacy behavior described in the app's privacy disclosure

The following are out of scope:

- Cloudflare's infrastructure and CDN behavior
- Third-party dependencies (report those to the upstream project)
- Social engineering or phishing
- Denial of service

## Disclosure

I'll coordinate disclosure timing with you. Fixes will be deployed before public disclosure whenever
possible. Credit will be given in the fix commit unless you prefer otherwise.
