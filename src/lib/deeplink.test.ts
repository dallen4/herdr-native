import { describe, expect, it } from 'vitest';
import { appFor } from './deeplink.ts';

describe('appFor', () => {
  it('names the app well-known hosts open in', () => {
    expect(appFor('https://github.com/acme/webapp/pull/3')).toBe(
      'GitHub',
    );
    expect(appFor('https://gist.github.com/x')).toBe('GitHub');
    expect(appFor('https://linear.app/team/issue/DEV-1')).toBe(
      'Linear',
    );
    expect(appFor('https://example.com')).toBeNull();
    expect(appFor('not a url')).toBeNull();
  });

  it("doesn't match look-alike hosts", () => {
    expect(appFor('https://notgithub.com')).toBeNull();
  });
});
