# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in this plugin, please report it responsibly.

**Do not open a public issue.** Instead, email the details to the maintainer or use GitHub's [private vulnerability reporting](https://github.com/gui-uxdoccom/pencildev-to-figma/security/advisories/new).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

## Scope

This plugin runs entirely client-side within Figma's plugin sandbox. It:

- **Does not** store or transmit user data to external servers
- **Does not** use OAuth or authentication tokens
- **Does not** have a backend or database
- **Does** fetch images from URLs referenced in `.pen` files (any domain)
- **Does** process user-uploaded `.pen` files (JSON) in the browser

## Known considerations

- **Network access** is set to `"*"` (all domains) because `.pen` files can reference images hosted anywhere. The plugin only fetches image URLs found in the design file.
- **`.pen` files are user-provided JSON** — the plugin validates structure before processing but treats the file as trusted input from the user who uploaded it.

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
