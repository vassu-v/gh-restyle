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

## The popup and the settings page

The extension has two parts. Every change shows up **right away** in all your open GitHub tabs; you don't need
to reload.

**The popup** (click the Gitling icon in the toolbar) is just a switch:

| Control | What it does |
|---|---|
| **Switch** (top right) | Turns Gitling on or off. Off puts GitHub back exactly the way it was, including its own light or dark mode and everything developer mode hid. |
| **Design card** | Shows which preset you're using (or "Your design") and its colours. |
| **Settings** | Opens the settings page in a tab. You can also get there from `chrome://extensions` → Gitling → Extension options. |

**The settings page** has everything else, and wears the design you're editing:

| Section | What it does |
|---|---|
| **Presets** | Signal, Terminal, Paper, Dense, Calm and Ink, the same as the app's Studio. One click applies one. |
| **Background:** Graphite / Black / Paper | Graphite is dark grey, Black is true black, Paper is light. GitHub's own dark or light mode switches to match, so code colors stay readable. |
| **Accent** | Six swatches, or any colour with the picker. Links, selected tabs and focus rings use it. |
| **Counters:** Dot / Mono / Sans | The font of the number badges (issue, pull request and star counts). Dot is the dot-matrix style from the app. |
| **Corners** | How round panels, buttons and inputs are. |
| **Text size** | 85% to 130%. The whole page scales evenly, like the browser's zoom, so GitHub's columns stay intact. |
| **Developer mode** | One switch for all of these, or each on its own: **hide sales menus** (enterprise, pricing, solutions, marketplace, "features"), **hide Copilot** (its buttons, menu entries and prompts), **hide the footer**, and **wide layout** (the whole window instead of GitHub's fixed width). |
| **Your design** | Paste a design code, a share link or a design file's text and click **Apply design**; or **Open a design file**, **Save as file**, **Copy design code** (to paste in the app), and **Reset to default**. |

A live preview on the right shows the look as you change it.

**What changes on GitHub** (on every page): colours, the Geist fonts, counters in your number style, small
lowercase mono section labels (like "shortcuts" in the app), mono times, pill-shaped buttons, search fields,
labels and topics, rounder code blocks, and selection and focus colours in your accent.

## Bring your phone design over

1. In the Gitling app, open **Studio** and set things up the way you like.
2. Tap **Copy design code** (gives a code starting with `GITLING1.`) or **Copy share link**. Or tap **Save as
   file**. Any of these works.
3. Get it to your computer: message it to yourself, email it, anything.
4. Open the extension's settings page. Paste the code or link in the box and click **Apply design**, or click
   **Open a design file** and pick the `.gitling.json` file.
5. You'll see "Applied". Your GitHub tabs change straight away.

If the code was cut off or mistyped, the settings page says so in red and leaves your current look alone. Copy
it again in full. Going the other way works too: **Copy design code** or **Save as file** on the settings page,
then paste or open it in the app's Studio → Share.

## Turn it off

- **For a moment:** flip the switch in the popup. Flip it again to bring your design back.
- **Completely:** in `chrome://extensions`, switch Gitling off or click **Remove**.

## Your settings

They're saved in Chrome's extension storage (`chrome.storage.sync`). They survive reloads, new tabs and
restarting Chrome. If you're signed in to Chrome with sync turned on, they follow you to your other computers.

## Known limits

- **Signed-in pages are mostly checked by eye.** The automated tests run signed out; the signed-in home's
  Copilot box is tested with GitHub's real markup as a fixture. If something looks off while you're signed in,
  take a screenshot and send it over.
- **After updating the extension,** open GitHub tabs get the new version automatically (no reload needed).
- **Only Chrome (Chromium) is tested.** Edge and Brave run Chrome extensions and should work, but nobody has
  checked. Firefox isn't tested and may need small changes.
- **Not on the Chrome Web Store.** It's load-unpacked only for now, so Chrome may remind you about developer
  mode extensions now and then.
- **Some things don't change:** images, GitHub's own illustrations, and code syntax colors. Syntax colors
  follow GitHub's own dark or light palette, which is picked to match your background.
- **Density and the tab bar from the app don't apply** to github.com. Text size does (it scales the page).
- **GitHub's signed-in home page** gets the theme but not yet its own Gitling layout.
- **Developer mode is matched by link addresses** (`/enterprise`, `/pricing`, `/features/copilot`…). A new
  sales or Copilot entry GitHub adds under another address stays until it's added to `content.css`.

## Tests

Both tests use a real Chromium with the extension loaded and visit the live github.com, signed out.

| Command | What it checks |
|---|---|
| `npm run e2e:extension` | The whole user flow: the settings page and popup open, the popup switch turns GitHub off and on, text size scales the page, developer mode hides and restores its parts, the default look applies, every settings control changes an open tab live, design codes and share links apply, a broken code shows an error, off restores GitHub exactly (also after in-site navigation), settings survive reloads, new tabs and a browser restart, clicking around GitHub keeps the look, gist works, and the extension causes no errors. Prints PASS/FAIL per check. Run `npm run build:extension` first. |
| `npm run stress:extension` | 26 kinds of GitHub pages in all three backgrounds. It compares text contrast against the same page without the extension and saves screenshots to `stress-report/`. |

---

## How it works (for developers)

The code is in `apps/extension`. `build.mjs` bundles `src/` with esbuild and copies `public/` into `dist/`.

- **`public/manifest.json`** is Manifest V3. It has a content script on `github.com/*` and
  `gist.github.com/*` that runs at `document_start`, the popup, the settings page (`options_ui`, opened in a
  tab), and the `storage` and `scripting` permissions with host access to the same two sites.
- **`src/background.ts`** (a tiny service worker) runs only on install and update: Chrome doesn't put new
  content-script code into tabs that are already open, so it injects it into every open GitHub tab. The old
  copy notices it's cut off and stops; the new one undoes its work using `data-gitling-orig` and
  `data-gitling-vars` on `<html>` (both removed when Gitling is off).
- **`src/content.ts`** (about 6 KB) runs on every GitHub page.
  1. It records GitHub's original `data-color-mode`, `data-light-theme` and `data-dark-theme` on `<html>`.
  2. It loads settings and sets those attributes to match the design's mode. This makes everything we don't
     override (syntax, diffs, controls) use GitHub's palette for that mode.
  3. It writes Primer CSS variables on `<html>` with `!important`, plus the `gitling-on` class and one
     `gitling-clean-<part>` class for each developer-mode part that's on.
  4. A `MutationObserver` puts the class and attributes back if GitHub rewrites them during navigation.
  5. `storage.onChanged` re-applies on every settings change, which is why the popup works live.
  6. Turning it off removes every variable and the class, and restores the original attributes.
- **`src/primer.ts`** maps a Gitling `Design` to GitHub's Primer tokens (`--bgColor-*`, `--fgColor-*`,
  `--button-*`, font stacks, radii) using `resolveTokens` from `packages/design`. Two details:
  - The accent fill `--bgColor-accent-emphasis` is deepened until white text on it reads at 4.5:1.
  - It also sets `--gitling-*` copies for regions that re-scope Primer tokens.
  - Overriding tokens instead of class names keeps it working when GitHub changes its markup.
- **`public/content.css`** holds the static rules: the bundled fonts (Geist, Geist Mono, Doto), the glass
  header, the counter font, the Gitling look (section labels, mono times, pills), the signed-out marketing
  header and gist's classic header, and developer mode. It targets Primer React's stable `prc-<Component>-`
  class prefixes, never GitHub's hashed names; developer mode matches link addresses with `:has()`.
- **`src/storage.ts`** reads and writes settings as one `chrome.storage.sync` key, `gitling`, with the shape
  `{ enabled, design, clean }` (`clean` holds the four developer-mode switches; missing ones read as off).
  - The content script does a light shape check and falls back to the default design if anything looks off.
  - It deep-imports from `packages/design` so zod stays out of the content script.
- **`src/popup.ts`** is the popup: the switch, the design card and the Settings button. It deep-imports from
  `packages/design`, so it's about 6 KB.
- **`src/options.ts`** is the settings page. It reads every design form (code, share link, design file) with
  `readDesignText` from `packages/design`, the same reader the app uses, and writes design files with
  `designToFile`. `src/presetOf.ts` names the preset a design matches.
- **Testing notes:** Playwright needs `channel: 'chromium'` to load extensions. The unpacked extension's ID
  comes from the absolute `dist` path: take the first 32 hex characters of its sha256, then map 0–f to a–p.
  `scripts/e2e-extension.mjs` and `scripts/stress-extension.mjs` both use this pattern.
