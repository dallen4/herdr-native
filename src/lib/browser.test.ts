import { loadableUrl, titleFor, toUrl } from '@devhub/shared/browser';
import { describe, expect, it } from 'vitest';

describe('toUrl', () => {
  it('keeps URLs, adds a scheme to hosts, searches the rest', () => {
    expect(toUrl('https://github.com/x')).toBe(
      'https://github.com/x',
    );
    expect(toUrl('github.com/acme/webapp')).toBe(
      'https://github.com/acme/webapp',
    );
    expect(toUrl('localhost:1420')).toBe('http://localhost:1420');
    expect(toUrl('tauri child webview')).toBe(
      'https://duckduckgo.com/?q=tauri%20child%20webview',
    );
  });
});

describe('titleFor', () => {
  it('reads as host plus path, or a file name', () => {
    expect(
      titleFor('https://www.github.com/acme/webapp/pull/3'),
    ).toBe('github.com/acme/webapp/pull/3');
    expect(titleFor('devhub-file:///Users/n/plan.html')).toBe(
      'plan.html',
    );
  });
});

describe('loadableUrl', () => {
  it('serves server files through the bridge', () => {
    expect(
      loadableUrl(
        'devhub-file:///Users/n/plan.html',
        'https://h.ts.net/devhub/',
      ),
    ).toBe(
      'https://h.ts.net/devhub/raw?path=%2FUsers%2Fn%2Fplan.html',
    );
    expect(loadableUrl('https://x.dev', 'https://h')).toBe(
      'https://x.dev',
    );
  });
});
