import XMarkdown from '@ant-design/x-markdown';
import { palette } from '../../theme/tokens.ts';

// Assistant prose, rendered with Ant Design X's streaming-friendly
// Markdown renderer.
export function Markdown({ text }: { text: string }) {
  return (
    <div
      className="devhub-markdown"
      style={{ color: palette.textSecondary, lineHeight: 1.65 }}
    >
      <XMarkdown content={text} />
    </div>
  );
}
