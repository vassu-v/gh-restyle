import { runs } from './runs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { base64Decode, base64Encode, utf8DecodeStrict, utf8Encode } from '../../packages/github/src/bytes';

// The hand-written decoders (used so applying suggestions works on React Native) must agree with the platform's
// own, which Node has in full: TextDecoder with fatal, and Buffer's base64.
const reference = (b: Uint8Array) => { try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(b); } catch { return null; } };

describe('bytes', () => {
  it('utf8DecodeStrict matches TextDecoder(fatal) on arbitrary bytes', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 64 }), (b) => { expect(utf8DecodeStrict(b)).toBe(reference(b)); }), { numRuns: runs(3000) });
  });
  it('utf8DecodeStrict matches TextDecoder(fatal) on near-valid UTF-8 (valid text with a byte flipped/cut)', () => {
    const nearValid = fc.tuple(fc.fullUnicodeString({ maxLength: 20 }), fc.nat(), fc.integer({ min: 0, max: 255 }), fc.boolean())
      .map(([s, i, v, cut]) => { const b = Buffer.from(s, 'utf8'); if (!b.length) return new Uint8Array(b); const k = i % b.length; if (cut) return new Uint8Array(b.subarray(0, k)); b[k] = v; return new Uint8Array(b); });
    fc.assert(fc.property(nearValid, (b) => { expect(utf8DecodeStrict(b)).toBe(reference(b)); }), { numRuns: runs(3000) });
  });
  it('utf8Encode matches Buffer for any string (lone surrogates aside)', () => {
    fc.assert(fc.property(fc.fullUnicodeString(), (s) => { expect(Buffer.from(utf8Encode(s)).equals(Buffer.from(s, 'utf8'))).toBe(true); }), { numRuns: runs(2000) });
  });
  it('base64 round-trips and matches Buffer, including GitHub-style line wrapping', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 200 }), fc.integer({ min: 1, max: 80 }), (b, w) => {
      const enc = base64Encode(b);
      expect(enc).toBe(Buffer.from(b).toString('base64'));
      const wrapped = (enc.match(new RegExp(`.{1,${w}}`, 'g')) ?? []).join('\n');
      expect(Buffer.from(base64Decode(wrapped)).equals(Buffer.from(b))).toBe(true);
    }), { numRuns: runs(2000) });
  });
});
