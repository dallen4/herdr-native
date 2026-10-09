import { describe, expect, it } from 'vitest';
import { untilReset } from './use-usage.ts';

describe('untilReset', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  it('formats minutes, hours and days', () => {
    expect(untilReset('2026-10-04T12:38:00Z', now)).toBe('38m');
    expect(untilReset('2026-10-04T14:14:00Z', now)).toBe('2h 14m');
    expect(untilReset('2026-10-07T16:00:00Z', now)).toBe('3d 4h');
    expect(untilReset('2026-10-04T11:00:00Z', now)).toBe('now');
  });
});
