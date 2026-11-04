import { lexer, type Token, type Tokens } from 'marked';
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Image, Platform, ScrollView, Text, View, type TextStyle } from 'react-native';
import { useTokens } from '@/design/DesignProvider';
import { openUrl, routes } from '@/lib/links';
import { CodeLines, languageForFence } from './Code';
import { router } from 'expo-router';

/**
 * GitHub-flavoured markdown → React Native views. Works the same on web, iOS and Android.
 * We render the markdown *source* (issue.body, README) instead of GitHub's HTML, because RN can't render HTML.
 * Supports: headings, paragraphs, emphasis, strike, inline + fenced code, links, autolinks, images, lists + task
 * lists, blockquotes, tables, rules, @mentions, #refs and a safe subset of inline HTML (<img>, <br>, <details>).
 *
 * `base` resolves relative links and images (README files link to files in the repo).
 */
export type MarkdownBase = { owner: string; repo: string; ref?: string; dir?: string };

export const Markdown = memo(function Markdown({ source, base }: { source: string | null | undefined; base?: MarkdownBase }) {
  const tokens = useMemo(() => {
    try { return lexer(source ?? '', { gfm: true, breaks: false }); } catch { return null; }
  }, [source]);
  const t = useTokens();
  if (!source?.trim()) return null;
  if (!tokens) return <Text style={{ color: t.c.fg, fontFamily: t.font.ui.regular }}>{source}</Text>;
  return <View style={{ gap: 10 }}><Blocks tokens={tokens} base={base} /></View>;
});

function Blocks({ tokens, base }: { tokens: Token[]; base?: MarkdownBase }) {
  return <>{tokens.map((tk, i) => <Block key={i} tk={tk} base={base} />)}</>;
}

function Block({ tk, base }: { tk: Token; base?: MarkdownBase }) {
  const t = useTokens(); const s = t.scale;
  const body: TextStyle = { fontFamily: t.font.ui.regular, fontSize: s(15), lineHeight: s(22), color: t.c.fg };
  switch (tk.type) {
    case 'space': return null;
    case 'heading': {
      const h = tk as Tokens.Heading;
      const size = [0, 22, 19, 17, 15.5, 15, 14][h.depth];
      return (
        <View style={{ marginTop: h.depth <= 2 ? 8 : 4, paddingBottom: h.depth <= 2 ? 6 : 0, borderBottomWidth: h.depth <= 2 ? 1 : 0, borderColor: t.c.line }}>
          <Text accessibilityRole="header" style={{ ...body, fontFamily: t.font.ui.semibold, fontSize: s(size), lineHeight: s(size * 1.3), letterSpacing: h.depth <= 2 ? -0.3 : 0 }}>
            <Inline tokens={h.tokens} base={base} />
          </Text>
        </View>
      );
    }
    case 'paragraph': {
      const p = tk as Tokens.Paragraph;
      // A paragraph that is only images/badges renders as a wrapping row of images.
      const imgs = p.tokens.filter((x) => x.type !== 'text' || (x as Tokens.Text).text.trim());
      if (imgs.length && imgs.every((x) => x.type === 'image' || (x.type === 'link' && (x as Tokens.Link).tokens.every((y) => y.type === 'image')) || (x.type === 'html' && /^<img/i.test((x as Tokens.HTML).text)))) {
        return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{imgs.map((x, i) => <InlineImage key={i} tk={x} base={base} />)}</View>;
      }
      return <Text style={body}><Inline tokens={p.tokens} base={base} /></Text>;
    }
    case 'text': {
      const x = tk as Tokens.Text;
      return <Text style={body}>{x.tokens ? <Inline tokens={x.tokens} base={base} /> : x.text}</Text>;
    }
    case 'code': {
      const c = tk as Tokens.Code;
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: t.c.el2, borderRadius: 12, borderWidth: 1, borderColor: t.c.line }}>
          <View style={{ paddingVertical: 12 }}><CodeLines code={c.text} lang={languageForFence(c.lang)} /></View>
        </ScrollView>
      );
    }
    case 'blockquote': {
      const q = tk as Tokens.Blockquote;
      return <View style={{ borderLeftWidth: 3, borderColor: t.c.line, paddingLeft: 12, gap: 8, opacity: 0.85 }}><Blocks tokens={q.tokens} base={base} /></View>;
    }
    case 'list': {
      const l = tk as Tokens.List;
      const start = typeof l.start === 'number' ? l.start : 1;
      return (
        <View style={{ gap: 4 }}>
          {l.items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ ...body, minWidth: l.ordered ? 22 : 14, color: it.task ? (it.checked ? t.c.ok : t.c.mut) : t.c.mut, fontFamily: l.ordered ? t.font.mono.regular : body.fontFamily }}>
                {it.task ? (it.checked ? '☑' : '☐') : l.ordered ? `${start + i}.` : '•'}
              </Text>
              <View style={{ flex: 1, gap: 4 }}><Blocks tokens={it.tokens.filter((x) => x.type !== 'checkbox')} base={base} /></View>
            </View>
          ))}
        </View>
      );
    }
    case 'table': {
      const tb = tk as Tokens.Table;
      // One width per column (from its longest cell) so header and rows line up.
      const widths = tb.header.map((h, k) => Math.min(260, Math.max(80, 22 + 7.5 * Math.max(h.text.length, ...tb.rows.map((r) => r[k]?.text.length ?? 0)))));
      const cell = (c: Tokens.TableCell, head: boolean, k: number) => (
        <View key={k} style={{ width: widths[k], paddingHorizontal: 10, paddingVertical: 8, borderLeftWidth: k ? 1 : 0, borderColor: t.c.line }}>
          <Text style={{ ...body, fontSize: s(13.5), lineHeight: s(19), fontFamily: head ? t.font.ui.semibold : t.font.ui.regular }}><Inline tokens={c.tokens} base={base} /></Text>
        </View>
      );
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ borderWidth: 1, borderColor: t.c.line, borderRadius: 10, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', backgroundColor: t.c.el2 }}>{tb.header.map((c, k) => cell(c, true, k))}</View>
            {tb.rows.map((r, i) => <View key={i} style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: t.c.line }}>{r.map((c, k) => cell(c, false, k))}</View>)}
          </View>
        </ScrollView>
      );
    }
    case 'hr': return <View style={{ height: 1, backgroundColor: t.c.line, marginVertical: 6 }} />;
    case 'html': {
      const h = (tk as Tokens.HTML).text;
      const img = h.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
      if (img) return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}><InlineImage tk={tk} base={base} /></View>;
      const text = htmlText(h);
      return text ? <Text style={{ ...body, color: t.c.mut }}>{text}</Text> : null;
    }
    default: {
      const raw = (tk as { raw?: string }).raw;
      return raw?.trim() ? <Text style={body}>{raw}</Text> : null;
    }
  }
}

const MENTION_SRC = '(^|[^\\w`])(@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})|#\\d+)\\b';

function Inline({ tokens, base }: { tokens?: Token[]; base?: MarkdownBase }): ReactNode {
  const t = useTokens();
  if (!tokens) return null;
  return tokens.map((tk, i) => {
    switch (tk.type) {
      case 'text': case 'escape': {
        const x = tk as Tokens.Text;
        if (x.tokens?.length) return <Inline key={i} tokens={x.tokens} base={base} />;
        return <Linkified key={i} text={decode(x.text)} base={base} />;
      }
      case 'strong': return <Text key={i} style={{ fontFamily: t.font.ui.semibold }}><Inline tokens={(tk as Tokens.Strong).tokens} base={base} /></Text>;
      case 'em': return <Text key={i} style={{ fontStyle: 'italic' }}><Inline tokens={(tk as Tokens.Em).tokens} base={base} /></Text>;
      case 'del': return <Text key={i} style={{ textDecorationLine: 'line-through', color: t.c.mut }}><Inline tokens={(tk as Tokens.Del).tokens} base={base} /></Text>;
      case 'codespan': return <Text key={i} style={{ fontFamily: t.font.mono.regular, fontSize: 13.5, backgroundColor: t.c.el2, color: t.c.fg }}>{` ${decode((tk as Tokens.Codespan).text)} `}</Text>;
      case 'br': return <Text key={i}>{'\n'}</Text>;
      case 'link': {
        const l = tk as Tokens.Link;
        const href = resolve(l.href, base, false);
        return <Text key={i} style={{ color: t.c.acc }} onPress={() => href && openUrl(href)} accessibilityRole="link"><Inline tokens={l.tokens} base={base} /></Text>;
      }
      case 'image': return <Text key={i} style={{ color: t.c.acc }} onPress={() => openUrl(resolve((tk as Tokens.Image).href, base, true) ?? '')}>{(tk as Tokens.Image).text || 'image'}</Text>;
      case 'html': {
        const h = (tk as Tokens.HTML).text;
        if (/^<br\s*\/?>$/i.test(h)) return <Text key={i}>{'\n'}</Text>;
        return null; // inline tags like <sup>, <kbd>: drop the tag, keep surrounding text
      }
      default: return <Text key={i}>{(tk as { raw?: string }).raw ?? ''}</Text>;
    }
  });
}

/** Turns @user and #123 into links. */
function Linkified({ text, base }: { text: string; base?: MarkdownBase }) {
  const t = useTokens();
  const parts: ReactNode[] = [];
  let last = 0; let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_SRC, 'g');
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length;
    parts.push(text.slice(last, start));
    const word = m[2];
    if (word.startsWith('@')) parts.push(<Text key={start} style={{ fontFamily: t.font.ui.semibold }} onPress={() => router.push(routes.user(word.slice(1)))}>{word}</Text>);
    else if (base) parts.push(<Text key={start} style={{ color: t.c.acc }} onPress={() => router.push(routes.thread(base.owner, base.repo, Number(word.slice(1))))}>{word}</Text>);
    else parts.push(word);
    last = start + word.length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function InlineImage({ tk, base }: { tk: Token; base?: MarkdownBase }) {
  let src = ''; let alt = ''; let link: string | null = null;
  if (tk.type === 'image') { src = (tk as Tokens.Image).href; alt = (tk as Tokens.Image).text; }
  else if (tk.type === 'link') { const l = tk as Tokens.Link; const im = l.tokens.find((x) => x.type === 'image') as Tokens.Image | undefined; src = im?.href ?? ''; alt = im?.text ?? ''; link = resolve(l.href, base, false); }
  else if (tk.type === 'html') { const h = (tk as Tokens.HTML).text; src = h.match(/src=["']([^"']+)["']/i)?.[1] ?? ''; alt = h.match(/alt=["']([^"']*)["']/i)?.[1] ?? ''; }
  const uri = resolve(src, base, true);
  if (!uri) return null;
  return <RemoteImage uri={uri} alt={alt} onPress={link ? () => openUrl(link!) : undefined} />;
}

function RemoteImage({ uri, alt, onPress }: { uri: string; alt: string; onPress?: () => void }) {
  const t = useTokens();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  // SVG (most README badges) can't be drawn by RN's Image on iOS/Android; the browser handles them on web.
  const svg = /\.svg(\?|$)|img\.shields\.io|badge/i.test(uri) && Platform.OS !== 'web';
  useEffect(() => {
    if (svg) return;
    let live = true;
    Image.getSize(uri, (w, h) => { if (live) setSize({ w, h }); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [uri, svg]);
  if (svg || failed) return alt ? <Text style={{ color: t.c.acc, fontFamily: t.font.ui.regular, fontSize: 13 }} onPress={onPress}>[{alt}]</Text> : null;
  if (!size) return <View style={{ width: 80, height: 20, borderRadius: 4, backgroundColor: t.c.el2 }} />;
  const small = size.h <= 40;
  const img = <Image source={{ uri }} accessibilityLabel={alt} resizeMode="contain" style={small ? { width: size.w, height: size.h } : { width: '100%', maxWidth: size.w, aspectRatio: size.w / size.h, borderRadius: 8 }} />;
  return onPress ? <Text onPress={onPress}>{img}</Text> : img;
}

/** Resolves a link or image URL relative to the repo (README links like docs/x.md or ./img.png). */
function resolve(href: string, base: MarkdownBase | undefined, image: boolean): string | null {
  if (!href) return null;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (/^(javascript|data|vbscript):/i.test(href)) return null;
  if (!base) return null;
  if (href.startsWith('#')) return null;
  const ref = base.ref ?? 'HEAD';
  const path = href.startsWith('/') ? href.slice(1) : [base.dir, href].filter(Boolean).join('/');
  const clean = normalize(path.split('#')[0].split('?')[0]);
  return image
    ? `https://raw.githubusercontent.com/${base.owner}/${base.repo}/${ref}/${clean}`
    : `https://github.com/${base.owner}/${base.repo}/blob/${ref}/${clean}`;
}
function normalize(path: string) {
  const out: string[] = [];
  for (const p of path.split('/')) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
  return out.join('/');
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
const decode = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => ENT[e] ?? (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : m));
const htmlText = (h: string) => decode(h.replace(/<!--[\s\S]*?-->/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|summary|h\d|li)>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
