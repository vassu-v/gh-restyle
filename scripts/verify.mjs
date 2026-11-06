// One command for "is everything still OK?": runs every local check in order and prints one summary table.
//   npm run verify                 all of it (about 4–6 minutes)
//   npm run verify -- --fast       typecheck, lint, unit + fuzz tests only (seconds; use while coding)
//   npm run verify -- --no-live    skip the steps that open live github.com (extension e2e)
// Unlike `npm run check && …`, it keeps going after a failure so you see every broken step at once.
import { spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const fast = args.has('--fast'), noLive = args.has('--no-live') || fast;
const steps = [
  ['typecheck', 'npm run typecheck'],
  ['lint', 'npm run lint'],
  ['unit + fuzz tests', 'npm test'],
  ...(fast ? [] : [
    ['build extension', 'npm run build:extension'],
    ['build web (+ PWA, CSP)', 'npm run build:web'],
    ['smoke: every screen, offline, CSP', 'npm run smoke'],
    ['e2e: sign-in', 'npm run e2e:signin'],
    ['e2e: studio', 'npm run e2e:studio'],
    ['e2e: PR review', 'npm run e2e:review'],
    ['e2e: welcome tour + design files', 'npm run e2e:onboarding'],
    ['e2e: authenticator', 'npm run e2e:authenticator'],
  ]),
  ...(noLive ? [] : [['e2e: extension on live github.com', 'npm run e2e:extension'], ['e2e: extension, user spec (written blind)', 'npm run e2e:extension:user']]),
];

const results = [];
for (const [name, cmd] of steps) {
  const t = Date.now();
  process.stdout.write(`\n▶ ${name}\n`);
  const r = spawnSync(cmd, { stdio: 'inherit', shell: true });
  results.push({ name, ok: r.status === 0, s: ((Date.now() - t) / 1000).toFixed(0) });
}
console.log('\n── verify summary ──');
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(38)} ${r.s}s`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} step(s) failed` : '\nall good');
process.exitCode = failed ? 1 : 0;
