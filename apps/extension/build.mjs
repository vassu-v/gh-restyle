// Bundles the extension into dist/ (load it unpacked from there).
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const here = fileURLToPath(new URL('.', import.meta.url));
rmSync(here + 'dist', { recursive: true, force: true });
mkdirSync(here + 'dist', { recursive: true });
cpSync(here + 'public', here + 'dist', { recursive: true });
await build({
  entryPoints: { content: here + 'src/content.ts', popup: here + 'src/popup.ts', options: here + 'src/options.ts' },
  outdir: here + 'dist',
  bundle: true,
  format: 'iife',
  target: ['chrome114', 'firefox115'],
  minify: true,
  logLevel: 'info',
});
