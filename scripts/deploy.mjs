// Builds the web app with the sign-in settings from services/edge/wrangler.toml, then deploys the
// Worker (app + sign-in) to Cloudflare. One source of truth: wrangler.toml [vars].
//   needs: CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID if the token sees several accounts), or `npx wrangler@4 login`
//   flags: --dry-run  build and bundle, don't upload
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const toml = readFileSync(`${root}services/edge/wrangler.toml`, 'utf8');
const v = (k) => toml.match(new RegExp(`^${k}\\s*=\\s*"([^"]*)"`, 'm'))?.[1] ?? '';
const clientId = v('GITHUB_CLIENT_ID');
// The deployed origin is the first https entry in ALLOWED_RETURN; the app and sign-in share it.
const origin = v('ALLOWED_RETURN').split(',').map((s) => s.trim()).find((s) => s.startsWith('https://')) ?? '';

if (!origin) console.warn('! No https origin in ALLOWED_RETURN yet: the app builds without one-tap sign-in (token paste still works).');
if (!clientId) console.warn('! GITHUB_CLIENT_ID is empty: the app builds without one-tap sign-in until the OAuth App exists.');

const env = { ...process.env, EXPO_PUBLIC_AUTH_URL: clientId && origin ? origin : '', EXPO_PUBLIC_GITHUB_CLIENT_ID: clientId && origin ? clientId : '' };
const run = (cmd, cwd = root) => execSync(cmd, { cwd, env, stdio: 'inherit' });

run('npm run build:web');
run(`npx --yes wrangler@4 deploy${process.argv.includes('--dry-run') ? ' --dry-run' : ''}`, `${root}services/edge`);
if (origin) console.log(`\nLive: ${origin}  ·  check: ${origin}/health`);
