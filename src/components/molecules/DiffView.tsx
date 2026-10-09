import { useMemo } from 'react';
import { highlight, languageFor } from '../../lib/highlight.ts';
import { fonts, palette, space, status } from '../../theme/tokens.ts';

// Past this many lines, skip highlighting to keep huge diffs snappy.
const HIGHLIGHT_LIMIT = 6000;

type Kind = 'add' | 'del' | 'ctx' | 'hunk' | 'file' | 'meta';

interface Line {
  kind: Kind;
  text: string;
  html: string | null;
}

const ROW: Record<Kind, React.CSSProperties> = {
  add: { background: 'rgba(169, 222, 84, 0.10)' },
  del: { background: 'rgba(255, 51, 58, 0.10)' },
  ctx: {},
  hunk: { color: status.working, background: '#14243A' },
  file: { color: palette.text, fontWeight: 600 },
  meta: { color: palette.textFaint },
};

const MARK: Partial<Record<Kind, { char: string; color: string }>> = {
  add: { char: '+', color: '#C2EA86' },
  del: { char: '-', color: status.errorText },
};

function parse(diff: string): Line[] {
  const raw = diff.split('\n');
  const doHighlight = raw.length <= HIGHLIGHT_LIMIT;
  let lang: string | null = null;
  return raw.map((text) => {
    if (text.startsWith('diff --git')) {
      const path = text.split(' b/').pop() ?? '';
      lang = languageFor(path);
      return { kind: 'file', text, html: null };
    }
    if (text.startsWith('+++') || text.startsWith('---')) {
      return { kind: 'meta', text, html: null };
    }
    if (text.startsWith('@@'))
      return { kind: 'hunk', text, html: null };
    if (
      /^(index |new file|deleted file|similarity|rename |old mode|new mode)/.test(
        text,
      )
    ) {
      return { kind: 'meta', text, html: null };
    }
    const kind: Kind = text.startsWith('+')
      ? 'add'
      : text.startsWith('-')
        ? 'del'
        : 'ctx';
    const code = text.slice(1);
    // Each line is highlighted on its own: cheap, and good enough for
    // review. Block comments spanning lines may color imperfectly.
    return {
      kind,
      text: code,
      html: doHighlight && lang ? highlight(code, lang) : null,
    };
  });
}

// A unified diff with syntax highlighting. Add/remove show as a gutter
// mark and a faint tint, so token colors keep their contrast.
export function DiffView({ diff }: { diff: string }) {
  const lines = useMemo(() => parse(diff), [diff]);
  if (!diff.trim()) {
    return (
      <div style={{ padding: space.lg, color: palette.textFaint }}>
        No changes.
      </div>
    );
  }
  return (
    <pre
      className="devhub-code"
      style={{
        margin: 0,
        padding: `${space.sm}px 0`,
        fontFamily: fonts.mono,
        fontSize: 12,
        lineHeight: 1.6,
        overflow: 'auto',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {lines.map((line, i) => {
        const mark = MARK[line.kind];
        const code =
          line.kind === 'add' ||
          line.kind === 'del' ||
          line.kind === 'ctx';
        return (
          <div
            key={i}
            style={{
              ...ROW[line.kind],
              display: 'flex',
              minHeight: '1.6em',
              paddingRight: space.md,
              whiteSpace: 'pre',
              ...(line.kind === 'file'
                ? { marginTop: i ? space.md : 0 }
                : {}),
            }}
          >
            <span
              aria-hidden
              style={{
                flex: '0 0 auto',
                width: 24,
                textAlign: 'center',
                color: mark?.color,
                userSelect: 'none',
              }}
            >
              {mark?.char ?? ' '}
            </span>
            {code && line.html !== null ? (
              <span dangerouslySetInnerHTML={{ __html: line.html }} />
            ) : (
              <span>{line.text}</span>
            )}
          </div>
        );
      })}
    </pre>
  );
}
