// Serving the app's web build from the bridge, so a phone (or any
// browser on the tailnet) can open the bridge URL and get devhub.
//
// The app is built with relative asset paths, and the bridge may sit
// under a mount path (`tailscale serve --set-path /devhub`) that the
// proxy may or may not strip, so files are found by suffix: for
// /devhub/m/x/p/y/assets/app.js, try each tail of the path until one
// names a real file in the build. Anything else gets index.html and the
// client-side router takes over.

import { existsSync, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { config } from './config.ts';

function fileFor(root: string, pathname: string): string | null {
  const parts = decodeURIComponent(pathname)
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..');
  for (let i = 0; i < parts.length; i++) {
    const candidate = normalize(join(root, ...parts.slice(i)));
    if (!candidate.startsWith(root + sep)) continue;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not this tail
    }
  }
  return null;
}

export function serveWeb(
  req: Request,
  pathname: string,
): Response | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const root = normalize(config.webDist);
  const index = join(root, 'index.html');
  if (!existsSync(index)) {
    return new Response(
      'devhub web build not found. On the server, run: pnpm web:build',
      { status: 404, headers: { 'content-type': 'text/plain' } },
    );
  }
  const file = fileFor(root, pathname);
  if (file) {
    // hashed bundles can be cached for good; everything else revalidates
    const immutable = /[\\/]assets[\\/].+-[\w-]{8,}\.\w+$/.test(file);
    return new Response(Bun.file(file), {
      headers: {
        'cache-control': immutable
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      },
    });
  }
  // a missing asset is a 404; a route is the app
  if (/\.\w{1,8}$/.test(pathname)) return null;
  return new Response(Bun.file(index), {
    headers: {
      'content-type': 'text/html',
      'cache-control': 'no-cache',
    },
  });
}
