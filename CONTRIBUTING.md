# Contributing to Pencil.dev to Figma

First off, thanks for being interested! This project was born from vibe coding and a genuine need to move Pencil designs into Figma without the pain. Contributions of any size are welcome.

## How to contribute

### Reporting bugs

- Open an [issue](https://github.com/gui-uxdoccom/pencildev-to-figma/issues) with a clear title
- Describe what happened vs. what you expected
- Include the Figma desktop app version and OS
- If possible, attach (or describe) the `.pen` file that caused the issue
- Screenshots of the plugin UI or Figma result are always helpful

### Suggesting features

- Open an issue with the `enhancement` label
- Describe the use case — what problem does it solve?
- If it's about a `.pen` format feature we don't support yet, mention which node type or property

### Submitting code

1. Fork the repo and create a branch from `main`
2. `npm install` and `npm run dev` to start the watch build
3. Load the plugin in Figma via **Plugins > Development > Import plugin from manifest...**
4. Make your changes and test with a real `.pen` file
5. Run `npm run build` to verify the production build compiles cleanly
6. Open a PR with a clear description of what changed and why

## Project structure rules

- **Plugin sandbox code** goes in `src/plugin/`, compiled with `tsconfig.plugin.json`
- **UI code** goes in `src/ui/`, compiled with `tsconfig.json`
- Never import DOM types (`Image`, `document`, `window`) into plugin-side code
- Never import Figma API types into UI-side code
- Keep the two worlds separate — they communicate only via `postMessage`

## Code style

- TypeScript strict mode
- No `any` unless absolutely necessary (and add a comment explaining why)
- Prefer small, focused functions
- No unnecessary abstractions — three similar lines beats a premature helper

## Questions?

Open a [discussion](https://github.com/gui-uxdoccom/pencildev-to-figma/discussions) or reach out via the issues page.
