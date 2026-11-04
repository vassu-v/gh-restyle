import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import makefile from 'highlight.js/lib/languages/makefile';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import type { Tokens } from '@gitling/design';
import { memo, useMemo } from 'react';
import { Text, View, type TextStyle } from 'react-native';
import { useTokens } from '@/design/DesignProvider';

/**
 * Syntax highlighting for the file viewer and markdown code blocks.
 * highlight.js core with a curated language set (imported one by one to keep the bundle small), its HTML
 * output parsed into lines of colored segments, colors taken from design tokens so every theme works.
 */
const LANGS = { bash, c, cpp, csharp, css, diff, dockerfile, go, ini, java, javascript, json, kotlin, makefile, markdown, php, python, ruby, rust, scss, sql, swift, typescript, xml, yaml };
for (const [name, def] of Object.entries(LANGS)) hljs.registerLanguage(name, def);

const BY_EXT: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  json: 'json', jsonc: 'json', py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', kts: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php', sh: 'bash', bash: 'bash', zsh: 'bash',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', css: 'css', scss: 'scss', html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml',
  md: 'markdown', markdown: 'markdown', sql: 'sql', diff: 'diff', patch: 'diff',
};
const BY_NAME: Record<string, string> = { dockerfile: 'dockerfile', makefile: 'makefile', '.bashrc': 'bash', '.zshrc': 'bash', '.env': 'bash', gemfile: 'ruby' };
const ALIASES: Record<string, string> = { js: 'javascript', ts: 'typescript', tsx: 'typescript', jsx: 'javascript', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', yml: 'yaml', toml: 'ini', html: 'xml', py: 'python', rb: 'ruby', rs: 'rust', kt: 'kotlin', cs: 'csharp', 'c++': 'cpp', md: 'markdown', docker: 'dockerfile', golang: 'go' };

/** highlight.js language for a file path, or null for plain text. */
export function languageForPath(path: string): string | null {
  const name = path.split('/').pop()!.toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  const ext = name.includes('.') ? name.split('.').pop()! : '';
  return BY_EXT[ext] ?? null;
}
/** highlight.js language for a markdown fence tag (```ts), or null. */
export function languageForFence(tag: string | undefined): string | null {
  const t = (tag ?? '').trim().toLowerCase().split(/\s/)[0];
  if (!t) return null;
  const l = ALIASES[t] ?? t;
  return hljs.getLanguage(l) ? l : null;
}

type Seg = { text: string; cls: string | null };

const ENT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };
/** Turns highlight.js HTML into lines of segments, keeping the innermost class for each piece of text. */
export function highlightToLines(code: string, lang: string | null): Seg[][] {
  if (!lang || !hljs.getLanguage(lang)) return code.split('\n').map((l) => [{ text: l, cls: null }]);
  let html: string;
  try { html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; } catch { return code.split('\n').map((l) => [{ text: l, cls: null }]); }
  const lines: Seg[][] = [[]];
  const stack: string[] = [];
  const re = /<span class="([^"]+)">|<\/span>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) stack.push(m[1]);
    else if (m[0] === '</span>') stack.pop();
    else {
      const text = m[2].replace(/&(amp|lt|gt|quot|#x27|#39);/g, (e) => ENT[e]);
      const cls = stack.length ? stack[stack.length - 1] : null;
      const parts = text.split('\n');
      parts.forEach((p, i) => { if (i) lines.push([]); if (p) lines[lines.length - 1].push({ text: p, cls }); });
    }
  }
  return lines;
}

function colorFor(cls: string | null, t: Tokens): TextStyle | undefined {
  if (!cls) return undefined;
  const k = cls.replace(/^hljs-/, '').split(/[\s_]/)[0];
  switch (k) {
    case 'keyword': case 'selector-tag': case 'meta': case 'doctag': return { color: t.c.acc };
    case 'string': case 'regexp': case 'addition': case 'symbol': case 'char': return { color: t.c.ok };
    case 'number': case 'literal': case 'variable': case 'template-variable': case 'bullet': return { color: t.c.wait };
    case 'comment': case 'quote': return { color: t.c.dim, fontStyle: 'italic' };
    case 'title': case 'section': case 'name': case 'selector-id': case 'selector-class': return { color: t.c.fg, fontFamily: t.font.mono.medium };
    case 'type': case 'built': case 'class': case 'params': return { color: t.c.merged };
    case 'attr': case 'attribute': case 'property': case 'tag': case 'link': return { color: t.c.mut };
    case 'deletion': return { color: t.c.bad };
    default: return undefined;
  }
}

/** Code with optional line numbers. Long files skip highlighting (it's the slow part) above `maxHighlight` lines. */
export const CodeLines = memo(function CodeLines({ code, lang, numbers = false, maxHighlight = 3000 }: { code: string; lang: string | null; numbers?: boolean; maxHighlight?: number }) {
  const t = useTokens();
  const lines = useMemo(() => {
    const n = code.split('\n').length;
    return highlightToLines(code, n <= maxHighlight ? lang : null);
  }, [code, lang, maxHighlight]);
  const base: TextStyle = { fontFamily: t.font.mono.regular, fontSize: 12.5, lineHeight: 19, color: t.c.fg };
  const w = String(lines.length).length;
  return (
    <View style={{ flexDirection: 'row' }}>
      {numbers ? <Text style={{ ...base, color: t.c.dim, textAlign: 'right', paddingHorizontal: 10, minWidth: w * 8 + 20 }}>{lines.map((_, i) => i + 1).join('\n')}</Text> : null}
      <Text selectable style={{ ...base, paddingRight: 16, paddingLeft: numbers ? 0 : 12 }}>
        {lines.map((segs, i) => (
          <Text key={i}>
            {segs.map((s, j) => <Text key={j} style={colorFor(s.cls, t)}>{s.text}</Text>)}
            {i < lines.length - 1 ? '\n' : ''}
          </Text>
        ))}
      </Text>
    </View>
  );
});
