# Setting up Pencil to Figma in Figma

This guide covers two ways to load the plugin: running it locally from source (recommended for development and testing) or installing it from the Figma Community once it is published.

---

## Option A — Load locally from source (development / self-hosted)

This is the method to use while testing before the plugin is published.

### 1. Build the plugin

```bash
cd pencil-to-figma
npm install
npm run build
```

After the build, confirm that `dist/main.js` and `dist/ui.html` exist.

### 2. Open Figma and navigate to plugin management

- In the **Figma desktop app**, open any file
- Click the Figma logo (top-left) → **Plugins** → **Development** → **Import plugin from manifest…**

> **Browser users:** open any Figma file → Main menu (hamburger icon, top-left) → **Plugins** → **Development** → **Import plugin from manifest…**

### 3. Select the manifest file

In the file picker that appears, navigate to the `pencil-to-figma/` folder and select **`manifest.json`**.

Figma will register the plugin under **Plugins → Development**.

### 4. Run the plugin

- Open a Figma file where you want to import your design
- Main menu → **Plugins** → **Development** → **Pencil to Figma**

The plugin UI will open as a panel.

---

## Option B — Install from Figma Community (once published)

> This option will be available after the plugin passes Figma's review process.

1. Go to [figma.com/community](https://figma.com/community) and search for **Pencil to Figma**
2. Click **Install**
3. Open any Figma file → Main menu → **Plugins** → **Pencil to Figma**

---

## Using the plugin

1. **Pick a file** — click the upload area and select a `.pen` file exported from Pencil.dev
2. **Watch progress** — the plugin fetches images and builds the Figma node tree; a progress indicator shows the current step
3. **Review the result** — once complete, a summary shows:
   - How many nodes were created
   - Any fonts that were substituted (missing fonts are replaced with **Inter** and listed here)
4. **Find your design** — Figma will switch to the newly created page named after your `.pen` file. Reusable components are placed on a separate `⚙ Pencil Components` page.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Plugin doesn't appear in the menu | Manifest not loaded or build not run | Re-run `npm run build`, re-import manifest |
| "Could not load image" warning | Image URL is behind auth or no longer exists | Check the URL in the original Pencil file; the asset may have been deleted |
| Text renders as Inter everywhere | Fonts used in the `.pen` file are not installed in Figma | Install the fonts via the Figma font installer or Adobe Fonts |
| Plugin UI is blank | Build output is missing or stale | Delete `dist/` and run `npm run build` again |
| Import hangs on progress screen | Large file with many remote images | Wait — image fetching happens sequentially per URL; large files can take 30–60 s |

---

## Re-building after changes

The plugin UI is fully inlined into `dist/ui.html` at build time. Any change to `src/` requires a rebuild:

```bash
npm run build
```

Figma picks up the new `dist/` files automatically on the next plugin invocation — no need to re-import the manifest.

For continuous development:

```bash
npm run dev   # webpack watch mode
```

Changes are picked up when you close and reopen the plugin panel in Figma.
