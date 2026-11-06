// Builds the web app with the sign-in settings from services/edge/wrangler.toml, then deploys the
// Worker (app + sign-in) to Cloudflare. One source of truth: wrangler.toml [vars].
//   needs: CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID if the token sees several accounts), or `npx wrangler@4.158.0 login`
//   flags: --dry-run           build and bundle, don't upload
//          --preview[=name]    upload a preview version instead of deploying: it gets its own URL
//                              (https://<name>-gitling.<subdomain>.workers.dev) and live traffic is untouched.
//                              Default name: the git branch (detached checkouts must name it).
//                              Sign-in fails on previews (not in ALLOWED_RETURN), so try them in sample mode.
// Pinned: wrangler runs with CLOUDFLARE_API_TOKEN, so an exact version, not a floating major (bump on purpose).
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));
const toml = readFileSync(`${root}services/edge/wrangler.toml`, 'utf8');
const v = (k) => toml.match(new RegExp(`^${k}\\s*=\\s*"([^"]*)"`, 'm'))?.[1] ?? '';
const clientId = v('GITHUB_CLIENT_ID');
// The deployed origin is the first https entry in ALLOWED_RETURN; the app and sign-in share it.
const origin = v('ALLOWED_RETURN').split(',').map((s) => s.trim()).find((s) => s.startsWith('https://')) ?? '';

if (!origin) console.warn('! No https origin in ALLOWED_RETURN yet: the app builds without one-tap sign-in (token paste still works).');
if (!clientId) console.warn('! GITHUB_CLIENT_ID is empty: the app builds without one-tap sign-in until the OAuth App exists.');

const env = { ...process.env, EXPO_PUBLIC_AUTH_URL: clientId && origin ? origin : '', EXPO_PUBLIC_GITHUB_CLIENT_ID: clientId && origin ? clientId : '' };
const run = (cmd, cwd = root) => execSync(cmd, { cwd, env, stdio: 'inherit' });

// The last --preview wins (`npm run deploy:preview -- --preview=x` passes both); `--preview x` takes the next word too.
const pi = process.argv.findLastIndex((a) => a === '--preview' || a.startsWith('--preview='));
const nextWord = pi >= 0 && process.argv[pi] === '--preview' && process.argv[pi + 1] && !process.argv[pi + 1].startsWith('--') ? process.argv[pi + 1] : '';
const previewArg = pi >= 0 ? (nextWord ? `--preview=${nextWord}` : process.argv[pi]) : undefined;
const dryRun = process.argv.includes('--dry-run');
// The current branch, or null on a detached checkout (CI, worktrees): those must name their alias, or two of them
// would share and overwrite one preview address.
const branch = () => { try { return execSync('git symbolic-ref --quiet --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null; } catch { return null; } };
let alias = '';
if (previewArg) {
  const wanted = previewArg.split('=')[1] || branch();
  if (!wanted) { console.error('No branch is checked out. Name the preview: node scripts/deploy.mjs --preview=<name>'); process.exit(1); }
  // Aliases become part of a hostname: lowercase letters, digits and dashes, starting with a letter.
  alias = wanted.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  if (alias && !/^[a-z]/.test(alias)) alias = `p-${alias}`.slice(0, 40);
  // Never fall through to the live deploy below because a preview name came out empty.
  if (!alias) { console.error(`"${wanted}" doesn't make a usable preview name. Use letters, digits and dashes.`); process.exit(1); }
}

run('npm run build:web');
if (previewArg) {
  run(`npx --yes wrangler@4.158.0 versions upload --preview-alias ${alias} --message "preview ${alias}"${dryRun ? ' --dry-run' : ''}`, `${root}services/edge`);
  const sub = origin ? new URL(origin).hostname.replace(/^gitling\./, '') : '<subdomain>.workers.dev';
  console.log(dryRun ? `\nDry run: nothing uploaded (preview would be ${alias}).` : `\nPreview: https://${alias}-gitling.${sub}  (live site unchanged)`);
  process.exit(0);
}
run(`npx --yes wrangler@4.158.0 deploy${process.argv.includes('--dry-run') ? ' --dry-run' : ''}`, `${root}services/edge`);
if (origin && !process.argv.includes('--dry-run')) {
  console.log(`\nLive: ${origin}  ·  check: ${origin}/health`);
  // Sign-in needs GITHUB_CLIENT_SECRET on the Worker; say so loudly if it's missing after a deploy.
  const health = await fetch(`${origin}/health`).then((r) => r.json()).catch(() => null);
  if (health && !health.configured) console.warn('\n! Sign-in is NOT configured on the live Worker: GITHUB_CLIENT_SECRET is missing. Add it as a Secret (docs/SETUP-SIGNIN.md).');
}
