// Keys a phone keyboard doesn't have, for the terminal key bar. Ctrl is
// sticky in the UI: it applies to the next key typed.

export const PHONE_KEYS: { label: string; data: string }[] = [
  { label: 'Esc', data: '\x1b' },
  { label: 'Tab', data: '\t' },
  { label: '↑', data: '\x1b[A' },
  { label: '↓', data: '\x1b[B' },
  { label: '←', data: '\x1b[D' },
  { label: '→', data: '\x1b[C' },
  { label: '^C', data: '\x03' },
];

/** The control character for a key: ctrl+a → \x01 … ctrl+z → \x1a.
 * Anything else passes through. */
export function ctrlOf(data: string): string {
  if (data.length !== 1) return data;
  const code = data.toUpperCase().charCodeAt(0);
  return code >= 64 && code <= 95
    ? String.fromCharCode(code - 64)
    : data;
}
