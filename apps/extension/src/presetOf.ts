// Deep imports keep zod out of the popup (see storage.ts).
import type { Design } from '@gitling/design/src/schema';
import { PRESETS } from '@gitling/design/src/presets';

/** The preset this design looks like (same theme), if any: named in the popup, highlighted on the settings page. */
export function presetOf(d: Design) {
  const t = d.theme;
  return PRESETS.find((p) => (Object.keys(p.theme) as (keyof Design['theme'])[]).every((k) => String(p.theme[k]).toLowerCase() === String(t[k]).toLowerCase()));
}
