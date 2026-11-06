// End-to-end test of "Sign in with GitHub" on the web build, with GitHub simulated.
//   real: the app build, the auth worker code (services/edge), PKCE, state, redirects, callback route, token vault
//   fake: github.com/login/oauth/* and api.github.com (intercepted in the browser / in the worker's fetch)
// Run: npm run e2e:signin   (builds the app with test sign-in config into a temp dir; leaves apps/app/dist alone)
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const APP_PORT = 8099, WORKER_PORT = 8787;
const APP = `http://127.0.0.1:${APP_PORT}`, WORKER = `http://127.0.0.1:${WORKER_PORT}`;
const out = mkdtempSync(join(tmpdir(), 'gitling-e2e-'));
const log = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) process.exitCode = 1; };

// 1. Build the web app with sign-in configured.
console.log('building app with test sign-in config…');
execSync(`npx expo export --platform web --output-dir ${out}/app`, {
  cwd: join(root, 'apps/app'), stdio: 'ignore',
  env: { ...process.env, EXPO_PUBLIC_GITHUB_CLIENT_ID: 'test-client', EXPO_PUBLIC_AUTH_URL: WORKER },
});

// 2. Run the real worker code in Node, with GitHub's token endpoint faked.
await build({ entryPoints: [join(root, 'services/edge/src/index.ts')], bundle: true, format: 'esm', platform: 'neutral', outfile: `${out}/worker.mjs`, logLevel: 'silent' });
const { handle } = await import(pathToFileURL(join(out, 'worker.mjs')).href);
const issued = new Map(); // code → code_challenge, recorded when the fake GitHub authorize page "approves"
const exchanges = [];
const fakeGitHubFetch = async (url, init) => {
  const body = JSON.parse(init.body);
  exchanges.push(body);
  const challenge = issued.get(body.code);
  const pkceOk = challenge && createHash('sha256').update(body.code_verifier).digest('base64url') === challenge;
  if (!pkceOk || body.client_secret !== 'test-secret' || body.redirect_uri !== `${WORKER}/auth/callback`) return new Response(JSON.stringify({ error: 'bad_verification_code' }));
  issued.delete(body.code); // codes are single-use
  return new Response(JSON.stringify({ access_token: 'gho_e2e_token', scope: 'repo,notifications,read:user', token_type: 'bearer' }));
};
const env = { GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-secret', ALLOWED_RETURN: `${APP},gitling://` };
const worker = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await handle(new Request(WORKER + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env, fakeGitHubFetch);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(WORKER_PORT, '127.0.0.1');

// 3. Serve the app (SPA fallback, like vercel.json).
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
const app = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, APP).pathname); const f = join(out, 'app', p);
  const target = p !== '/' && existsSync(f) && extname(f) ? f : join(out, 'app', 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream' }); res.end(readFileSync(target));
}).listen(APP_PORT, '127.0.0.1');

// 4. Drive a browser.
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const apiCalls = [];
// Fake github.com authorize page: "approves" immediately and redirects to the worker callback, like GitHub does.
await ctx.route('https://github.com/login/oauth/authorize**', (route) => {
  const u = new URL(route.request().url());
  const code = 'e2ecode' + Math.random().toString(36).slice(2, 10);
  issued.set(code, u.searchParams.get('code_challenge'));
  log(u.searchParams.get('client_id') === 'test-client' && u.searchParams.get('code_challenge_method') === 'S256' && u.searchParams.get('redirect_uri') === `${WORKER}/auth/callback`, 'authorize request has client id, S256 challenge and the worker callback');
  route.fulfill({ status: 302, headers: { Location: `${WORKER}/auth/callback?code=${code}&state=${encodeURIComponent(u.searchParams.get('state'))}` } });
});
// Fake api.github.com: accept only the issued token.
let slowApi = 0; // ms of delay, to prove a reopened app shows its saved cache before GitHub answers
await ctx.route('https://api.github.com/**', async (route) => {
  if (slowApi) await new Promise((r) => setTimeout(r, slowApi));
  const auth = route.request().headers()['authorization'];
  apiCalls.push(auth);
  if (auth !== 'Bearer gho_e2e_token') return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Bad credentials"}' });
  const path = new URL(route.request().url()).pathname;
  const body = path === '/user' ? { login: 'e2e-user', name: 'E2E User', avatar_url: '' } : path.startsWith('/search') ? { total_count: 0, items: [] } : [];
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
});

const page = await ctx.newPage();
// A returning user: first-launch tour behaviour is covered by npm run e2e:onboarding.
await page.addInitScript(() => localStorage.setItem('gitling.onboarded.v1', 'e2e'));
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${APP}/account`, { waitUntil: 'networkidle' });
log(await page.getByText('Sign in with GitHub', { exact: true }).isVisible(), 'Account shows the one-tap button when sign-in is configured');
await page.getByText('Sign in with GitHub', { exact: true }).click();
await page.waitForURL(`${APP}/`, { timeout: 15000 }).catch(() => {});
await page.waitForLoadState('networkidle');
log(new URL(page.url()).pathname === '/', `returned home after sign-in (at ${page.url()})`);
log(exchanges.length === 1 && exchanges[0].client_secret === 'test-secret', 'worker exchanged the code once, adding the secret server-side');
log(apiCalls.includes('Bearer gho_e2e_token'), 'app calls api.github.com with the new token');

await page.goto(`${APP}/account`, { waitUntil: 'networkidle' });
log(await page.getByText('@e2e-user').isVisible().catch(() => false), 'signed-in account is shown');
const stored = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('gitling', 1); q.onsuccess = () => r(q.result); });
  const box = await new Promise((r) => { const q = db.transaction('vault').objectStore('vault').get('token'); q.onsuccess = () => r(q.result); });
  return { hasBox: !!box, plainInBox: JSON.stringify(box ?? {}).includes('gho_'), local: JSON.stringify(localStorage).includes('gho_'), session: JSON.stringify(sessionStorage).includes('gho_') };
});
log(stored.hasBox && !stored.plainInBox && !stored.local && !stored.session, 'token is stored encrypted in IndexedDB, not in plain text anywhere');

await page.reload({ waitUntil: 'networkidle' });
log(await page.getByText('@e2e-user').isVisible().catch(() => false), 'still signed in after reload');

// Saved cache (src/data/persist.ts): what you saw is kept on the device, shown at once on the next open, gone on sign-out.
const savedCache = () => page.evaluate(async () => {
  const db = await new Promise((r, j) => { const q = indexedDB.open('gitling-cache', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
  return new Promise((r) => { const q = db.transaction('kv').objectStore('kv').get('gitling.query-cache.v1'); q.onsuccess = () => r(q.result ?? null); });
});
await page.waitForTimeout(2000); // the cache is written at most every 1.5 s
const saved = await savedCache();
log(!!saved && saved.includes('e2e-user') && !saved.includes('gho_'), 'signed-in data is saved on the device (and never the token)');
slowApi = 4000;
await page.goto(`${APP}/account`, { waitUntil: 'domcontentloaded' });
const shownFast = await page.getByText('@e2e-user').waitFor({ timeout: 2500 }).then(() => true, () => false);
log(shownFast, 'a reopened app shows the saved data before GitHub answers (API delayed 4 s)');
slowApi = 0;
await page.waitForLoadState('networkidle');

// Replaying the callback (back button / refresh) must not sign in again or crash.
const before = exchanges.length;
await page.goto(`${APP}/auth/callback?code=e2ecodereplay&state=x.y`, { waitUntil: 'networkidle' });
log(exchanges.length === before && (await page.getByText('out of date').isVisible().catch(() => false)), 'a replayed or forged callback is refused without calling the worker');

await page.goto(`${APP}/account`, { waitUntil: 'networkidle' });
await page.getByText('Sign out', { exact: true }).click();
await page.waitForTimeout(500);
const afterOut = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('gitling', 1); q.onsuccess = () => r(q.result); });
  return new Promise((r) => { const q = db.transaction('vault').objectStore('vault').get('token'); q.onsuccess = () => r(q.result ?? null); });
});
log(afterOut === null, 'sign out deletes the stored token');
await page.waitForTimeout(2000);
const savedAfterOut = await savedCache();
log(!savedAfterOut || !savedAfterOut.includes('e2e-user'), 'sign out removes the saved copy of your data');

// Denied on GitHub → friendly message.
await ctx.unroute('https://github.com/login/oauth/authorize**');
await ctx.route('https://github.com/login/oauth/authorize**', (route) => {
  const u = new URL(route.request().url());
  route.fulfill({ status: 302, headers: { Location: `${WORKER}/auth/callback?error=access_denied&state=${encodeURIComponent(u.searchParams.get('state'))}` } });
});
await page.goto(`${APP}/account`, { waitUntil: 'networkidle' });
await page.getByText('Sign in with GitHub', { exact: true }).click();
await page.getByText('You cancelled the sign-in on GitHub.').waitFor({ timeout: 10000 }).then(() => log(true, 'cancelling on GitHub shows a clear message'), () => log(false, 'cancelling on GitHub shows a clear message'));

log(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close(); worker.close(); app.close();
console.log(process.exitCode ? '\nsign-in e2e FAILED' : '\nsign-in e2e passed');
