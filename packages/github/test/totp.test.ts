import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { base32Decode, hmacSha1, hotp, parseOtpInput, totp } from '../src/totp';

const ascii = (s: string) => new TextEncoder().encode(s);
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const base32Encode = (bytes: Uint8Array) => {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};

const RFC_KEY = ascii('12345678901234567890');
const RFC_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('hmacSha1', () => {
  it('matches RFC 2202 test cases 1–3', () => {
    expect(hex(hmacSha1(new Uint8Array(20).fill(0x0b), ascii('Hi There')))).toBe('b617318655057264e28bc0b6fb378c8ef146be00');
    expect(hex(hmacSha1(ascii('Jefe'), ascii('what do ya want for nothing?')))).toBe('effcdf6ae5eb2fa2d27416d5f184df9c259a7c79');
    expect(hex(hmacSha1(new Uint8Array(20).fill(0xaa), new Uint8Array(50).fill(0xdd)))).toBe('125d7342b9ac11cd91a39af48aa17b4f63f175d3');
  });

  it('hashes keys longer than 64 bytes first (RFC 2202 cases 6 and 7)', () => {
    const key = new Uint8Array(80).fill(0xaa);
    expect(hex(hmacSha1(key, ascii('Test Using Larger Than Block-Size Key - Hash Key First')))).toBe('aa4ae5e15272d00e95705637ce8a3b55ed402112');
    expect(hex(hmacSha1(key, ascii('Test Using Larger Than Block-Size Key and Larger Than One Block-Size Data')))).toBe('e8e99d0f45237d786d6bbaa7965c7808bbff1a91');
  });
});

describe('hotp', () => {
  it('matches RFC 4226 Appendix D for counters 0–9', () => {
    const want = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expect(want.map((_, i) => hotp(RFC_KEY, i))).toEqual(want);
  });
});

describe('totp', () => {
  it('matches RFC 6238 Appendix B (SHA-1, 8 digits), including counters past 2^32', () => {
    const vectors: [number, string][] = [
      [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
      [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130'],
    ];
    for (const [t, code] of vectors) expect(totp({ secret: RFC_B32, digits: 8, period: 30 }, t * 1000).code).toBe(code);
  });

  it('makes 6-digit codes by default length and pads with zeros', () => {
    expect(totp({ secret: RFC_B32, digits: 6, period: 30 }, 1111111109 * 1000).code).toBe('081804');
  });

  it('counts down the seconds left and resets at period boundaries', () => {
    const a = { secret: RFC_B32, digits: 6 as const, period: 30 };
    expect(totp(a, 0).remaining).toBe(30);
    expect(totp(a, 999).remaining).toBe(30);
    expect(totp(a, 1000).remaining).toBe(29);
    expect(totp(a, 29_000).remaining).toBe(1);
    expect(totp(a, 29_999).remaining).toBe(1);
    expect(totp(a, 30_000).remaining).toBe(30);
    expect(totp(a, 29_999).code).not.toBe(totp(a, 30_000).code);
    expect(totp(a, 30_000).code).toBe(totp(a, 59_999).code);
    expect(totp({ ...a, period: 60 }, 59_000).remaining).toBe(1);
    expect(totp({ ...a, period: 60 }, 60_000).remaining).toBe(60);
  });

  it('throws without echoing the secret when it is not base32', () => {
    expect(() => totp({ secret: 'NOT-VALID-1!', digits: 6, period: 30 })).toThrow('This setup key is not valid.');
    try { totp({ secret: 'SECRET!!SECRET', digits: 6, period: 30 }); } catch (e) { expect(String(e)).not.toContain('SECRET'); }
  });

  it('agrees with node:crypto HMAC-SHA1 for 200 random secrets and times', () => {
    for (let i = 0; i < 200; i++) {
      const key = randomBytes(1 + Math.floor(Math.random() * 100));
      const period = [30, 60, 10, 300][i % 4];
      const digits = ([6, 7, 8] as const)[i % 3];
      const now = Math.floor(Math.random() * 4e12);
      const counter = Math.floor(now / 1000 / period);
      const msg = Buffer.alloc(8);
      msg.writeBigUInt64BE(BigInt(counter));
      const h = createHmac('sha1', key).update(msg).digest();
      const o = h[19] & 0x0f;
      const bin = h.readUInt32BE(o) & 0x7fffffff;
      const want = String(bin % 10 ** digits).padStart(digits, '0');
      expect(hex(hmacSha1(new Uint8Array(key), new Uint8Array(msg)))).toBe(h.toString('hex'));
      expect(totp({ secret: base32Encode(key), digits, period }, now).code).toBe(want);
    }
  });
});

describe('base32Decode', () => {
  const want = hex(RFC_KEY);
  it('decodes upper and lower case, spaces, dashes and padding', () => {
    expect(hex(base32Decode(RFC_B32)!)).toBe(want);
    expect(hex(base32Decode(RFC_B32.toLowerCase())!)).toBe(want);
    expect(hex(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')!)).toBe(want);
    expect(hex(base32Decode('GEZD-GNBV-GY3T-QOJQ-GEZD-GNBV-GY3T-QOJQ')!)).toBe(want);
    expect(hex(base32Decode('MZXW6===')!)).toBe(hex(ascii('foo')));
    expect(hex(base32Decode('MZXW6YQ=')!)).toBe(hex(ascii('foob')));
  });

  it('returns null for invalid characters or nothing at all', () => {
    for (const bad of ['GEZD1NBV', 'GEZD0NBV', 'GEZD8', 'GE=ZD', 'ÄBCD', '', '   ', '===']) expect(base32Decode(bad)).toBeNull();
  });
});

describe('parseOtpInput', () => {
  const refuse = (input: string) => {
    const r = parseOtpInput(input);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected a refusal');
    expect(r.error).toMatch(/^[A-Z].*\.$/);
    expect(r.error).not.toMatch(/GEZDGNBV|JBSWY3DP/i);
    return r.error;
  };

  it('accepts a bare GitHub-style setup key with spaces', () => {
    const r = parseOtpInput('  gezd gnbv gy3t qojq  ', 'octocat');
    expect(r).toEqual({ ok: true, account: { issuer: 'GitHub', label: 'octocat', secret: 'GEZDGNBVGY3TQOJQ', digits: 6, period: 30 } });
  });

  it('reads issuer and label from an otpauth link', () => {
    const r = parseOtpInput(`otpauth://totp/GitHub:octocat?secret=${RFC_B32}&issuer=GitHub`);
    expect(r).toEqual({ ok: true, account: { issuer: 'GitHub', label: 'octocat', secret: RFC_B32, digits: 6, period: 30 } });
  });

  it('takes digits and period from the link', () => {
    const r = parseOtpInput(`otpauth://totp/x?secret=${RFC_B32}&digits=8&period=60&algorithm=sha1`);
    expect(r.ok && r.account).toMatchObject({ digits: 8, period: 60 });
  });

  it('handles a label with no issuer prefix', () => {
    const r = parseOtpInput(`otpauth://totp/octocat?secret=${RFC_B32}`);
    expect(r.ok && r.account).toMatchObject({ issuer: 'GitHub', label: 'octocat' });
    const named = parseOtpInput(`otpauth://totp/octocat?secret=${RFC_B32}&issuer=Example`);
    expect(named.ok && named.account).toMatchObject({ issuer: 'Example', label: 'octocat' });
  });

  it('decodes a URL-encoded label', () => {
    const r = parseOtpInput(`otpauth://totp/GitHub%3Aocto%20cat%40example.com?secret=${RFC_B32}`);
    expect(r.ok && r.account).toMatchObject({ issuer: 'GitHub', label: 'octo cat@example.com' });
  });

  it('refuses with a readable sentence', () => {
    expect(refuse('')).toMatch(/setup key/);
    expect(refuse('   ')).toMatch(/setup key/);
    expect(refuse(`otpauth://hotp/GitHub:octocat?secret=${RFC_B32}&counter=1`)).toMatch(/time-based/);
    expect(refuse(`otpauth://totp/GitHub:octocat?secret=${RFC_B32}&algorithm=SHA256`)).toMatch(/SHA256/);
    expect(refuse('GEZD GNBV')).toMatch(/too short/);
    expect(refuse(`otpauth://totp/x?secret=GEZDGNBV`)).toMatch(/secret/);
    expect(refuse('GEZD GNBV GY3T QOJ1')).toMatch(/letters A–Z/);
    expect(refuse(`otpauth://totp/x?secret=${RFC_B32}&digits=9`)).toMatch(/unusual/);
    expect(refuse(`otpauth://totp/x?secret=${RFC_B32}&period=5`)).toMatch(/unusual/);
    refuse('otpauth://');
    expect(refuse('otpauth://[broken/x?secret=GEZDGNBVGY3TQOJQ')).toMatch(/isn't complete/);
    expect(refuse(`otpauth://totp/%E0%A4%A?secret=${RFC_B32}`)).toMatch(/isn't complete/);
  });

  it('refuses absurdly long keys and keeps names short', () => {
    expect(refuse('A'.repeat(300))).toMatch(/too long/);
    expect(refuse(`otpauth://totp/x?secret=${'A'.repeat(300)}`)).toMatch(/secret/);
    const r = parseOtpInput(`otpauth://totp/${'i'.repeat(100)}:${'l'.repeat(100)}?secret=${RFC_B32}`);
    expect(r.ok && [r.account.issuer.length, r.account.label.length]).toEqual([40, 60]);
  });
});
