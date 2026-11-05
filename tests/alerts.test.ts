import { lexer, type Tokens } from 'marked';
import { describe, expect, it } from 'vitest';
import { alertOf } from '../apps/app/src/ui/alerts';

const quote = (md: string) => (lexer(md, { gfm: true }).find((t) => t.type === 'blockquote') as Tokens.Blockquote).text;

describe('GitHub alert blockquotes', () => {
  it('reads the kind and keeps the rest of the quote', () => {
    expect(alertOf(quote('> [!NOTE]\n> Summarized by **CodeRabbit**\n> second line'))).toEqual({ kind: 'NOTE', rest: 'Summarized by **CodeRabbit**\nsecond line' });
    expect(alertOf(quote('> [!warning]\n> Careful'))?.kind).toBe('WARNING');
    expect(alertOf(quote('> [!CAUTION]'))).toEqual({ kind: 'CAUTION', rest: '' });
  });
  it('leaves ordinary quotes alone', () => {
    expect(alertOf(quote('> just a quote'))).toBeNull();
    expect(alertOf(quote('> [!NOTE] text on the same line'))).toBeNull();
    expect(alertOf(quote('> [!DANGER]\n> not a GitHub kind'))).toBeNull();
    expect(alertOf(quote('> text\n> [!NOTE]'))).toBeNull();
  });
});

describe('alert bodies', () => {
  it('resolve reference-style links defined elsewhere in the document', async () => {
    const { lexAlertBody } = await import('../apps/app/src/ui/alerts');
    const doc = lexer('> [!TIP]\n> See [docs][guide].\n\n[guide]: https://example.com/guide', { gfm: true });
    const q = doc.find((t) => t.type === 'blockquote') as Tokens.Blockquote;
    const body = lexAlertBody(alertOf(q.text)!.rest, doc.links);
    const link = (body[0] as Tokens.Paragraph).tokens.find((t) => t.type === 'link') as Tokens.Link | undefined;
    expect(link?.href).toBe('https://example.com/guide');
  });
});
