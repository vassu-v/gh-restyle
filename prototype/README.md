# Gitling

A GitHub client for your phone that you design yourself. It runs on the GitHub REST API and installs to your home screen as a web app.

## What's in it

- **Home** you arrange yourself: counters, shortcut tiles, "Needs you", an inbox preview and recent repos. Drag sections to reorder them, or hide them.
- **Inbox** with swipe triage: swipe right for done, swipe left to mark read. There's an Undo toast, filter chips and day groups.
- **Repos, issues and PRs**: README, code browser, commits and diffs. You can comment, close, reopen and star. Merge takes two taps.
- **Studio**, a sheet over the live app:
  - 7 presets: Graphite, Blueprint, Terminal Moss, Risograph, Darkroom, Tidepool, Ledger
  - Accent color (contrast is adjusted automatically), light/dark/system
  - Background pattern, font pair, text size, corner radius, card style, icon weight, density
  - Tab bar style, plus which tabs appear and in what order
- **Custom tiles**: pick a glyph, emoji or letters, a color, a style (solid, soft or outline) and a size. A tile can open:
  - a GitHub search
  - a repo, landing on its overview, issues, PRs, code or commits
  - a person
  - a file
  - an inbox filter
  - any link
  - an "ask first" prompt that fills `{query}` into a link or search

  Tiles can show live counts.
- **Share**: copy your whole design as a `GITLING1:` code and paste it on another device.

## Run it

It's static files and needs no build step to run.

```bash
cd gitling && python3 -m http.server 8000
```

Then open http://localhost:8000. Without a token it shows sample data.

## Put it on your phone (GitHub Pages)

1. Push this folder to a GitHub repo.
2. In the repo, go to **Settings → Pages**, set Source to "Deploy from a branch", and pick `main` / root.
3. Open `https://<you>.github.io/<repo>/` on your phone, then choose **Share → Add to Home Screen** (iOS) or **Install app** (Android).

## Signing in

Create a **classic** personal access token with the `repo`, `notifications` and `read:user` scopes. Fine-grained tokens can't read notifications.

Then paste it in **Profile → Connect**. The token is stored only in your browser's localStorage and is sent only to `api.github.com`.

## Files

- `app.html`: markup and styles
- `app.js`: views, Studio, tiles and the theme engine
- `data.js`: the API client and the sample data
- `build.mjs`: wraps `app.html` into the standalone `index.html`. Run `node build.mjs` after editing `app.html`.
