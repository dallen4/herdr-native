import { RightOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { fonts, palette, space } from '../../theme/tokens.ts';

// Claude's reasoning, folded to one line: a preview that expands to the
// full text. Kept small and muted so responses stand out.
export function Reasoning({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const preview = text.replace(/\s+/g, ' ').trim();

  return (
    <div style={{ minWidth: 0 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.xs,
          width: '100%',
          minWidth: 0,
          padding: 0,
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
          fontSize: 12.5,
          color: palette.textFaint,
        }}
      >
        <RightOutlined
          style={{
            fontSize: 9,
            transition: 'transform 120ms ease',
            transform: open ? 'rotate(90deg)' : undefined,
          }}
        />
        <span style={{ fontFamily: fonts.mono, fontSize: 11.5 }}>
          reasoning
        </span>
        {!open && (
          <span className="devhub-ellipsis" style={{ flex: 1 }}>
            {preview}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            marginTop: space.xs,
            paddingLeft: space.md,
            borderLeft: `1px solid ${palette.borderStrong}`,
            fontSize: 12.5,
            lineHeight: 1.6,
            color: palette.textFaint,
            whiteSpace: 'pre-wrap',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}
