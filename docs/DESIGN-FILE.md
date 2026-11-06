# The Gitling design file (`*.gitling.json`)

A design file holds a whole Gitling setup in one readable JSON file: the look, the tab bar, what Home shows, and
the shortcut tiles. You can keep it, edit it by hand, put it in a repo or a gist, and load it on another device
or in the desktop extension.

- **Save one:** Studio → Share → **Save as file**. On a phone (the web app or a native build) it opens the share
  sheet, so you can pick Save to Files, Drive, AirDrop and so on. On a computer it downloads the file.
- **Load one:** Studio → Share → **Open a design file**, or step 5 of the welcome tour (phone browsers too). In
  a native build, paste the file's text into the box instead. In the desktop extension, paste the text into the popup.
- **Every box that takes a design reads all four forms:** a design file, a bare design object, a `GITLING1.…`
  code, or a share link.

## Format

```json
{
  "$schema": "https://gitling.truckcoding.workers.dev/design.schema.json",
  "format": "gitling.design",
  "formatVersion": 1,
  "name": "Paper desk",
  "exportedAt": "2026-11-05T12:00:00.000Z",
  "design": {
    "version": 1,
    "skin": "signal",
    "theme": { "accent": "#4C6EF5", "background": "paper", "numbers": "sans", "tiles": "window", "density": 3, "textScale": 1 },
    "nav": { "tabs": ["home", "inbox", "repos", "studio"] },
    "home": { "sections": [{ "id": "status", "visible": true }, { "id": "feed", "visible": false }] },
    "tiles": [
      { "id": "t-review", "label": "Waiting on you", "icon": "eye", "tint": "#F2C25B", "count": true, "size": "half",
        "target": { "type": "search", "q": "is:open is:pr review-requested:@me archived:false" } }
    ]
  }
}
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Always `"gitling.design"`. Anything else is refused. |
| `formatVersion` | yes | `1`. A higher number means a newer Gitling wrote it, so the app asks you to update instead of guessing. |
| `design` | yes | The Design document, exactly what the app stores (`packages/design/src/schema.ts`). |
| `name` | no | A label shown when loading (max 80 characters). Gitling fills in the preset's name if you use one. |
| `exportedAt` | no | When it was saved (ISO 8601). Informational only. |
| `$schema` | no | Points editors at the JSON Schema below, for autocomplete and validation. |

The `design` fields:

| Field | Values |
|---|---|
| `theme.accent` | `#RRGGBB` |
| `theme.background` | `graphite`, `black`, `paper` |
| `theme.numbers` | `dot`, `mono`, `sans` |
| `theme.tiles` | `window`, `plain` |
| `theme.density` | 1–5 |
| `theme.textScale` | 0.85–1.3 |
| `nav.tabs` | 2–5 of `home`, `feed`, `inbox`, `repos`, `studio`; must include `studio` |
| `home.sections` | In display order, at least one with `visible: true`. Built-ins are `{ id, visible }`, each id once: `status`, `shortcuts`, `needs`, `feed`, `inbox`, `recent`, `reviews`, `my-prs`, `assigned`, `mentions`, `starred`, `checks` (`visible: false` means "not on Home, can be added"; missing ones are added switched off). Search sections are `{ id: "q-…", visible, title, q }`: any GitHub issue/PR search under your own title (≤ 40 characters), up to 12. A list with nothing visible is left out and the default Home is used. |
| `tiles` | up to 24; each has `label` (≤ 40 characters), `icon`, `tint`, `count`, `size` (`half` or `full`) and a `target` |

A `target` is one of:
- `search` with `q`
- `repo` with `repo: "owner/name"` and `tab`
- `user` with `login`
- `file` with `repo` and `path`
- `inbox` with `filter`
- `link` with `url`
- `ask` with `prompt`, `template` (contains `{query}`) and `dest`

Links may not use schemes that run code in the page (`javascript:`, `data:`, `blob:`, …). App links like
`obsidian://` and `tel:` are fine.

## Loading rules

- **Partly invalid files still load.** Anything that doesn't validate in this version (an unsafe link tile, an
  unknown section) is left out, and the app names what it left out. This is the same salvage used for designs
  saved on the device.
- **Files over 256 KB are refused.** A real design is a few KB.
- **Byte order mark:** a leading BOM is ignored.

## JSON Schema

`apps/app/public/design.schema.json` is published with the app at
`https://gitling.truckcoding.workers.dev/design.schema.json`. A unit test keeps it in step with the zod schema
(`packages/design/test/file.test.ts`). It checks the shape (types, allowed values, Studio in the tab bar, each
tab once); the app checks more when it loads a file (for example it leaves out links that could run code), so a
file an editor accepts can still have parts the app leaves out, and the app says which. After changing the schema, regenerate it:

```bash
UPDATE_DESIGN_SCHEMA=1 npx vitest run packages/design/test/file.test.ts
```

## Code

| Piece | Where |
|---|---|
| Writing a file, file names, reading any of the four forms | `packages/design/src/file.ts`: `designToFile`, `designFileName`, `readDesignText` |
| Downloading and the file picker (web), the share sheet (native) | `apps/app/src/lib/designFile.ts` |
| Tests | `packages/design/test/file.test.ts`, `npm run e2e:onboarding` (save, then open through the real file picker), `npm run e2e:extension` (the popup takes a file) |

**Changing the format:** bump `formatVersion` only for changes an older Gitling would misread. Keep reading
older versions, and add a test for each.
