# Another Pencil.dev to Figma Plugin :)

> Because sometimes you just want your Pencil designs in Figma... and you don't want to rebuild them from scratch.

This is a **Figma plugin** that imports [Pencil.dev](https://pencil.dev) `.pen` design files into Figma — screens, components, images, fonts, auto-layout, and all. Drop your `.pen` file in, pick the screens you want, and watch the magic happen.

---

## What it does

- **Reads `.pen` files** directly in the Figma plugin UI (no server needed, it's all client-side)
- **Imports screens** as Figma frames with proper sizing and positioning
- **Handles images** — fetches remote images, loads local ones from your folder, and converts SVG/WebP to PNG on the fly (because Figma only speaks PNG/JPEG/GIF)
- **Maps fonts** — scans your design for required fonts, checks what's available in Figma, and lets you remap missing ones before import
- **Preserves structure** — frames, rectangles, ellipses, lines, polygons, vectors, text nodes, groups, and auto-layout all come through
- **Reusable components** — nodes marked as `reusable` in Pencil become Figma Components on a dedicated page; references become Instances
- **Gradients, effects, strokes** — linear/radial gradients, drop shadows, blurs, and strokes are all mapped over
- **Rich text** — font weights, styles, letter spacing, line height, and per-segment formatting

## How to use it

1. Clone this repo
2. `npm install`
3. `npm run build`
4. In Figma, go to **Plugins > Development > Import plugin from manifest...**
5. Point it to the `manifest.json` in this repo
6. Open the plugin, drop your `.pen` file (and optionally its image folder), pick your screens, map any missing fonts, and hit Import

## How it works (the nerdy bit)

```
.pen file (JSON)
     |
     v
 [UI Iframe]               [Plugin Sandbox]
  - Parse JSON               - Create Figma nodes
  - Fetch images              - Map node types
  - Convert formats           - Apply fills/strokes/effects
  - Font scanning             - Build components
     |                             |
     +------- postMessage ---------+
```

The plugin runs in two separate runtimes (thanks Figma):
- **UI iframe** — has DOM access, can fetch URLs, render canvas, show the React UI
- **Plugin sandbox** — has Figma API access, creates nodes, sets fills, manages pages

Images are fetched and base64-encoded in the UI, then sent to the sandbox where they become Figma Image fills. Fonts are scanned against Figma's available font list, with a remapping step if anything's missing.

## Tech stack

- TypeScript + React
- Webpack (dual entry: plugin sandbox + UI iframe)
- Figma Plugin API
- Zero runtime dependencies beyond React

## Project structure

```
src/
  plugin/                     # Figma sandbox code
    main.ts                   # Entry point, orchestrates import
    transformer.ts            # Pencil node -> Figma node conversion
    imageHandler.ts           # Image decoding + Figma image creation
    fontMapper.ts             # Font resolution + fallback logic
    componentRegistry.ts      # Reusable component tracking
    variableResolver.ts       # $variable reference resolution
  ui/                         # React UI (iframe)
    App.tsx                   # Main app logic + image fetching
    screens/                  # Step-by-step UI screens
shared/
  types.ts                    # Shared type definitions
```

## Building from source

```bash
npm install
npm run build        # production build -> dist/
npm run dev          # watch mode for development
```

## Known limitations

- Rich text segments (mixed styles within a single text node) are partially supported
- `.pen` files older than v2.9 may produce unexpected results
- Complex SVG path data may not render perfectly as Figma vectors

## The vibe coding disclaimer

This entire plugin was built with **vibe coding** — that beautiful workflow where you describe what you want to an AI and it writes the code while you sip coffee and nod approvingly. Some call it the future of software development. Others call it laziness. We call it *efficient*.

Was every line reviewed by a human? Probably not. Does it work? Surprisingly well, actually.

---

Guil was lazy to write about himself, but you can visit his blog here - https://blog.gui-ux.com or find out about his other hobbie here https://www.dangerglobe.com

---

## License

MIT
