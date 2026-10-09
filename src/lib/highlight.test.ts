import { describe, expect, it } from 'vitest';
import { highlightLines, languageFor } from './highlight.ts';

describe('languageFor', () => {
  it('maps extensions to Prism languages', () => {
    expect(languageFor('src/App.tsx')).toBe('tsx');
    expect(languageFor('Cargo.toml')).toBe('toml');
    expect(languageFor('notes.txt')).toBeNull();
  });
});

describe('highlightLines', () => {
  it('keeps one entry per line with balanced spans', () => {
    const code = 'const a = `x\ny`;\n/* one\ntwo */';
    const lines = highlightLines(code, 'typescript');
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      const opens = line.match(/<span /g)?.length ?? 0;
      const closes = line.match(/<\/span>/g)?.length ?? 0;
      expect(opens).toBe(closes);
    }
    expect(lines[3]).toContain('two */');
  });

  it('escapes plain text', () => {
    expect(highlightLines('<b>&', null)).toEqual(['&lt;b&gt;&amp;']);
  });
});
