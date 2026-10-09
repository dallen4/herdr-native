import { afterEach, describe, expect, it } from 'bun:test';
import { authorize, isLoopbackHost } from './auth.ts';
import { config } from './config.ts';

const LOCAL = '127.0.0.1';
const saved = { ...config };
afterEach(() => Object.assign(config, saved));

const req = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, {
    headers: { host: new URL(url).host, ...headers },
  });

describe('isLoopbackHost', () => {
  it('accepts loopback names on any port', () => {
    expect(isLoopbackHost('localhost:7417')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('[::1]:7417')).toBe(true);
  });

  it('refuses everything else', () => {
    expect(isLoopbackHost(null)).toBe(false);
    expect(isLoopbackHost('evil.example:7417')).toBe(false);
    expect(isLoopbackHost('localhost.evil.example')).toBe(false);
    expect(isLoopbackHost('127.0.0.1.nip.io')).toBe(false);
  });
});

describe('authorize', () => {
  it('lets a plain loopback request in', () => {
    const r = authorize(
      req('http://localhost:7417/api/cli/ls'),
      LOCAL,
    );
    expect(r).toEqual({ ok: true, via: 'loopback' });
  });

  it('refuses a DNS-rebound request (loopback, foreign Host)', () => {
    const r = authorize(req('http://evil.example:7417/ws'), LOCAL);
    expect(r.ok).toBe(false);
  });

  it('refuses proxied loopback requests', () => {
    const r = authorize(
      req('http://localhost:7417/ws', {
        'x-forwarded-for': '1.2.3.4',
      }),
      LOCAL,
    );
    expect(r.ok).toBe(false);
  });

  it('refuses loopback when DEVHUB_BRIDGE_LOOPBACK=0', () => {
    config.loopback = false;
    const r = authorize(req('http://localhost:7417/ws'), LOCAL);
    expect(r.ok).toBe(false);
  });

  it('refuses remote requests without credentials', () => {
    const r = authorize(req('http://localhost:7417/ws'), '10.0.0.5');
    expect(r.ok).toBe(false);
  });

  it('takes the bearer token anywhere', () => {
    config.token = 'sekrit';
    const r = authorize(
      req('http://h.example/raw?path=x', {
        authorization: 'Bearer sekrit',
      }),
      '10.0.0.5',
    );
    expect(r).toEqual({ ok: true, via: 'token' });
  });

  it('takes ?token= on the WebSocket upgrade only', () => {
    config.token = 'sekrit';
    expect(
      authorize(req('http://h.example/ws?token=sekrit'), '10.0.0.5'),
    ).toEqual({ ok: true, via: 'token' });
    expect(
      authorize(
        req('http://h.example/raw?path=x&token=sekrit'),
        '10.0.0.5',
      ).ok,
    ).toBe(false);
  });

  it('refuses a wrong token', () => {
    config.token = 'sekrit';
    const r = authorize(
      req('http://localhost:7417/ws', {
        authorization: 'Bearer nope',
      }),
      LOCAL,
    );
    expect(r).toEqual({ ok: false, reason: 'bad_token' });
  });
});
