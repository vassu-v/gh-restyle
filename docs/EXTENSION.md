# The Gitling browser extension

**What it does:** it puts your Gitling look on github.com in your desktop browser. Same background, accent,
fonts and counter style as your phone app. It doesn't sign you in to anything and doesn't read your data. It
only changes how GitHub looks, using the GitHub session you already have.

It works on `github.com` and `gist.github.com`.

## Install it in Chrome

It isn't on the Chrome Web Store yet, so you load it yourself ("unpacked"). It takes a minute.

1. Get the built extension folder. Either:
   - **From the repo:** run `npm install`, then `npm run build:extension`. The folder is `apps/extension/dist`.
   - **From a zip someone sent you:** unzip it somewhere you won't delete. The folder you need is the one
     with `manifest.json` inside.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick that folder.
5. Pin it: click the puzzle-piece icon in the toolbar, then the pin next to **Gitling for GitHub**.
6. Open any GitHub page. It's already styled with the default look (Graphite).

**To update after new code:** run `npm run build:extension` again, then click the round arrow on the
Gitling card in `chrome://extensions`. Reload your GitHub tabs.

## The popup: every control

Click the Gitling icon in the toolbar. Every change shows up **right away** in all your open GitHub tabs. You
don't need to reload.

| Control | What it does |
|---|---|
| **Restyle GitHub** (checkbox) | Turns the look on or off. Off puts GitHub back exactly the way it was, including its own light or dark mode. |
| **Background:** Graphite / Black / Paper | Graphite is dark grey, Black is true black, Paper is light. GitHub's own dark or light mode switches to match, so code colors stay readable. |
| **Counters:** Dot / Mono / Sans | The font of the little number badges (issue, pull request and star counts). Dot is the dot-matrix style from the app. |
| **Design code box + Apply design** | Paste a design from the phone app. This brings over everything: background, accent color, counters and corner style. |

There's no accent picker in the popup. To change the accent, pick it in the app's Studio and bring the design
over (next section).

## Bring your phone design over

1. In the Gitling app, open **Studio** and set things up the way you like.
2. Tap **Copy design code** (gives a code starting with `GITLING1.`) or **Copy share link**. Or tap **Save as
   file** and open the `.gitling.json` file on your computer to copy its text. Any of these works.
3. Get it to your computer: message it to yourself, email it, anything.
4. Open the extension popup, paste it in the box, and click **Apply design**.
5. You'll see "Applied". Your GitHub tabs change straight away.

If the code was cut off or mistyped, the popup says so in red and leaves your current look alone. Copy it
again in full.

## Turn it off

- **For a moment:** untick **Restyle GitHub** in the popup. Tick it again to bring your design back.
- **Completely:** in `chrome://extensions`, switch Gitling off or click **Remove**.

## Your settings

They're saved in Chrome's extension storage (`chrome.storage.sync`). They survive reloads, new tabs and
restarting Chrome. If you're signed in to Chrome with sync turned on, they follow you to your other computers.

## Known limits

- **Signed-in GitHub pages aren't tested yet.** All automated tests run signed out. If something looks off
  while you're signed in, take a screenshot and send it over.
- **Only Chrome (Chromium) is tested.** Edge and Brave run Chrome extensions and should work, but nobody has
  checked. Firefox isn't tested and may need small changes.
- **Not on the Chrome Web Store.** It's load-unpacked only for now, so Chrome may remind you about developer
  mode extensions now and then.
- **Some things don't change:** images, GitHub's own illustrations, and code syntax colors. Syntax colors
  follow GitHub's own dark or light palette, which is picked to match your background.
- **Density and text size from the app don't apply** to github.com. Only colors, fonts, counters and corner
  shapes do.

## Tests

Both tests use a real Chromium with the extension loaded and visit the live github.com, signed out.

| Command | What it checks |
|---|---|
| `npm run e2e:extension` | The whole user flow: the popup opens, the default look applies, every popup control changes an open tab live, design codes and share links apply, a broken code shows an error, off restores GitHub exactly (also after in-site navigation), settings survive reloads, new tabs and a browser restart, clicking around GitHub keeps the look, gist works, and the extension causes no errors. Prints PASS/FAIL per check. Run `npm run build:extension` first. |
| `npm run stress:extension` | 26 kinds of GitHub pages in all three backgrounds. It compares text contrast against the same page without the extension and saves screenshots to `stress-report/`. |

---

## How it works (for developers)

The code is in `apps/extension`. `build.mjs` bundles `src/` with esbuild and copies `public/` into `dist/`.

- **`public/manifest.json`** is Manifest V3. It has a content script on `github.com/*` and
  `gist.github.com/*` that runs at `document_start`, the popup, and the `storage` permission only. There's
  no background service worker.
- **`src/content.ts`** (about 6 KB) runs on every GitHub page.
  1. It records GitHub's original `data-color-mode`, `data-light-theme` and `data-dark-theme` on `<html>`.
  2. It loads settings and sets those attributes to match the design's mode. This makes everything we don't
     override (syntax, diffs, controls) use GitHub's palette for that mode.
  3. It writes Primer CSS variables on `<html>` with `!important`, plus the `gitling-on` class.
  4. A `MutationObserver` puts the class and attributes back if GitHub rewrites them during navigation.
  5. `storage.onChanged` re-applies on every settings change, which is why the popup works live.
  6. Turning it off removes every variable and the class, and restores the original attributes.
- **`src/primer.ts`** maps a Gitling `Design` to GitHub's Primer tokens (`--bgColor-*`, `--fgColor-*`,
  `--button-*`, font stacks, radii) using `resolveTokens` from `packages/design`. Two details:
  - The accent fill `--bgColor-accent-emphasis` is deepened until white text on it reads at 4.5:1.
  - It also sets `--gitling-*` copies for regions that re-scope Primer tokens.
  - Overriding tokens instead of class names keeps it working when GitHub changes its markup.
- **`public/content.css`** holds the static rules: the bundled fonts (Geist, Geist Mono, Doto), the glass
  header, the counter font, pill-shaped primary buttons, and the signed-out marketing header and gist's
  classic header. That's the only place it targets class names.
- **`src/storage.ts`** reads and writes settings as one `chrome.storage.sync` key, `gitling`, with the shape
  `{ enabled, design }`.
  - The content script does a light shape check and falls back to the default design if anything looks off.
  - It deep-imports from `packages/design` so zod stays out of the content script.
- **`src/popup.ts`** handles the popup.
  - It validates pasted codes with `decodeDesign` (zod) from `packages/design/src/share.ts`. That's the same
    `GITLING1.` + base64url JSON format that Studio's `encodeDesign` produces.
  - It also accepts a Studio share link and reads the `import=` parameter.
- **Testing notes:** Playwright needs `channel: 'chromium'` to load extensions. The unpacked extension's ID
  comes from the absolute `dist` path: take the first 32 hex characters of its sha256, then map 0–f to a–p.
  `scripts/e2e-extension.mjs` and `scripts/stress-extension.mjs` both use this pattern.
