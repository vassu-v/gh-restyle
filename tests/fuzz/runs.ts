/** Run counts scale with FUZZ_SCALE (default 1): `FUZZ_SCALE=20 npm run test:fuzz` for a deep stress run. */
export const runs = (n: number) => Math.max(1, Math.round(n * Number(process.env.FUZZ_SCALE ?? 1)));
