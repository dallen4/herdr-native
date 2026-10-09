import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
const { appBase } = await import('./base.ts');

describe('appBase', () => {
  it('finds the mount path before the app routes', () => {
    expect(appBase('/devhub/')).toBe('/devhub');
    expect(appBase('/devhub/m/studio/p/w5%3Ap1')).toBe('/devhub');
    expect(appBase('/devhub/machines')).toBe('/devhub');
    expect(appBase('/devhub/b/dh_123')).toBe('/devhub');
  });

  it('is empty at the root', () => {
    expect(appBase('/')).toBe('');
    expect(appBase('/m/studio/p/w1%3Ap1')).toBe('');
  });
});
