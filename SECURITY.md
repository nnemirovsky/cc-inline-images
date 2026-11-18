# Security policy

## Reporting a vulnerability

Report privately through GitHub, not in a public issue:

**[Open a private security advisory](https://github.com/nnemirovsky/cc-inline-images/security/advisories/new)**

The report is visible only to the maintainer ([@nnemirovsky](https://github.com/nnemirovsky)) until an advisory is published, so nothing sensitive is exposed while a fix is prepared. Expect an acknowledgement within a week.

If the form is unavailable, open a normal issue that says only "I would like a private channel for a security report", with no details, and a private advisory will be opened for you.

Never attach real credentials, tokens, personal data or private files to a report. Describe the shape of the problem instead.

## Supported versions

Only the latest release gets security fixes.

## Scope

inline-images reads image files and hands their bytes to your terminal. In scope:

- Terminal escape sequences from a file name, a path or image data reaching the terminal as anything other than an image, for example text that rewrites the screen or makes the terminal run a command.
- A crafted PNG, JPEG or GIF that makes the bundled decoders hang, use unbounded memory or crash Claude Code. This includes bugs in the bundled copies of jpeg-js and omggif that the plugin reaches.
- Reading a file nothing asked for. The plugin opens only paths shown in the session and paths you write to your own inbox file.
- Writing anywhere other than its inbox file under `~/.cache/inline-images/inbox/`.

Out of scope:

- Anything that needs an attacker who can already run code as you or write to your home directory.
- Bugs in a terminal's own kitty graphics support.

