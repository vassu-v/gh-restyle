/**
 * Run counts scale with FUZZ_SCALE (default 1) for a deep stress run:
 *   bash:        FUZZ_SCALE=20 npm run test:fuzz
 *   PowerShell:  $env:FUZZ_SCALE = '20'; npm run test:fuzz
 */
const scale = Number(process.env.FUZZ_SCALE ?? 1);
// A typo would give NaN, and fast-check then runs zero cases and still passes.
if (!Number.isFinite(scale) || scale <= 0) throw new Error(`FUZZ_SCALE must be a positive number, got "${process.env.FUZZ_SCALE}"`);
export const runs = (n: number) => Math.max(1, Math.round(n * scale));
