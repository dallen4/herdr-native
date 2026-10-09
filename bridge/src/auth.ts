// Who may use the bridge. Anyone who gets in can type into terminals,
// so the rules are strict:
//
// 1. A request carrying the bridge token (Authorization: Bearer, or
//    ?token= on the WebSocket upgrade only, which can't set headers).
// 2. A request proxied by `tailscale serve` whose Tailscale-User-Login
//    matches the owner. tailscale serve strips that header from
//    anything incoming, so it can't be forged through the proxy.
// 3. A direct loopback request with no proxy headers and a loopback
//    Host (local dev, SSH tunnels). The Host check stops DNS
//    rebinding: a web page whose domain resolves to 127.0.0.1 still
//    sends its own domain as Host. DEVHUB_BRIDGE_LOOPBACK=0 turns this
//    rule off, for machines other users can log in to.
//
// Anything else is refused.

import { timingSafeEqual } from 'node:crypto';
import { config, routePath } from './config.ts';

let detectedOwner: string | null = null;

/** Read this machine's own Tailscale login, once, at start. */
export async function detectOwner(): Promise<string | null> {
  if (config.owner) return config.owner;
  // The macOS app bundles its CLI outside PATH.
  const cli =
    Bun.which('tailscale') ??
    '/Applications/Tailscale.app/Contents/MacOS/Tailscale';
  try {
    const proc = Bun.spawn([cli, 'status', '--json'], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const status = (await new Response(proc.stdout).json()) as {
      Self?: { UserID?: number };
      User?: Record<string, { LoginName?: string }>;
    };
    const id = status.Self?.UserID;
    detectedOwner =
      (id !== undefined && status.User?.[String(id)]?.LoginName) ||
      null;
  } catch {
    detectedOwner = null;
  }
  return detectedOwner;
}

const owner = () => config.owner ?? detectedOwner;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const isLoopback = (address: string | undefined) =>
  !!address &&
  (address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1');

/** A Host header naming this machine's loopback, on any port. */
export function isLoopbackHost(host: string | null): boolean {
  if (!host) return false;
  const name = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : host.replace(/:\d+$/, '');
  return (
    name === 'localhost' || name === '127.0.0.1' || name === '[::1]'
  );
}

export type AuthResult =
  | { ok: true; via: 'token' | 'tailscale' | 'loopback' }
  | { ok: false; reason: string };

export function authorize(
  req: Request,
  remoteAddress: string | undefined,
): AuthResult {
  const url = new URL(req.url);
  const bearer = req.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '');
  const token =
    bearer ??
    (routePath(url.pathname) === '/ws'
      ? url.searchParams.get('token')
      : null);
  if (config.token && token) {
    return safeEqual(token, config.token)
      ? { ok: true, via: 'token' }
      : { ok: false, reason: 'bad_token' };
  }

  const login = req.headers.get('tailscale-user-login');
  if (login) {
    const expected = owner();
    return expected && login === expected
      ? { ok: true, via: 'tailscale' }
      : { ok: false, reason: 'not_owner' };
  }

  const proxied =
    req.headers.has('x-forwarded-for') ||
    req.headers.has('forwarded') ||
    req.headers.has('x-forwarded-host');
  if (
    config.loopback &&
    !proxied &&
    isLoopback(remoteAddress) &&
    isLoopbackHost(req.headers.get('host'))
  ) {
    return { ok: true, via: 'loopback' };
  }
  return { ok: false, reason: 'unauthorized' };
}
