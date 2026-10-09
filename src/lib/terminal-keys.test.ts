import { describe, expect, it } from 'vitest';
import { ctrlOf } from './terminal-keys.ts';

describe('ctrlOf', () => {
  it('maps letters to control characters', () => {
    expect(ctrlOf('c')).toBe('\x03');
    expect(ctrlOf('C')).toBe('\x03');
    expect(ctrlOf('d')).toBe('\x04');
    expect(ctrlOf('[')).toBe('\x1b');
  });

  it('passes other input through', () => {
    expect(ctrlOf('1')).toBe('1');
    expect(ctrlOf('ab')).toBe('ab');
  });
});
