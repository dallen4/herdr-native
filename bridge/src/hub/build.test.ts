import { describe, expect, it } from 'bun:test';
import { shellTitle, toAgentStatus } from './build.ts';

describe('shellTitle', () => {
  it('reduces a user@host prompt to the folder name', () => {
    expect(shellTitle('user@host:~/Projects/webapp')).toBe('webapp');
    expect(shellTitle('user@host:~')).toBe('~');
    expect(shellTitle('user@host:/tmp/')).toBe('tmp');
  });

  it('keeps other titles as they are', () => {
    expect(shellTitle('pnpm test:watch')).toBe('pnpm test:watch');
    expect(shellTitle(null)).toBe('shell');
  });
});

describe('toAgentStatus', () => {
  it('maps blocked to needsYou and unknown to idle', () => {
    expect(toAgentStatus('blocked')).toBe('needsYou');
    expect(toAgentStatus('unknown')).toBe('idle');
  });
});
