// Syntax highlighting with Prism. Output is Prism's escaped HTML, so
// it's safe to inject; token colors live in theme/global.css and are
// tuned to stay readable on the diff's add/remove tints.

import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-sql';

const BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  md: 'markdown',
  mdx: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  rs: 'rust',
  py: 'python',
  go: 'go',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
};

export function languageFor(path: string): string | null {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  if (name === 'dockerfile' || name === 'makefile') return 'bash';
  const ext = name.includes('.')
    ? name.slice(name.lastIndexOf('.') + 1)
    : '';
  const lang = BY_EXTENSION[ext];
  return lang && Prism.languages[lang] ? lang : null;
}

const escape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Highlighted HTML for a whole file. */
export function highlight(code: string, lang: string | null): string {
  const grammar = lang ? Prism.languages[lang] : undefined;
  return grammar
    ? Prism.highlight(code, grammar, lang!)
    : escape(code);
}

/** Highlighted HTML per line. Highlighting the whole text first keeps
 * multi-line tokens (block comments, template strings) correct, then
 * the HTML is split at newlines with open spans closed and reopened. */
export function highlightLines(
  code: string,
  lang: string | null,
): string[] {
  const html = highlight(code, lang);
  const lines: string[] = [];
  const open: string[] = [];
  let current = '';
  const tag = /<span [^>]*>|<\/span>|\n/g;
  let last = 0;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    current += html.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[0] === '\n') {
      lines.push(current + '</span>'.repeat(open.length));
      current = open.join('');
    } else if (m[0] === '</span>') {
      open.pop();
      current += m[0];
    } else {
      open.push(m[0]);
      current += m[0];
    }
  }
  lines.push(current + html.slice(last));
  return lines;
}
