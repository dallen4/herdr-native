// Bridge configuration, all from the environment.

import { join } from 'node:path';

const env = process.env;

const basePath = (env.DEVHUB_BRIDGE_BASE_PATH ?? '/').replace(
  /\/+$/,
  '',
);

export const config = {
  host: env.DEVHUB_BRIDGE_HOST ?? '127.0.0.1',
  port: Number(env.DEVHUB_BRIDGE_PORT ?? 7417),
  /** Mount path behind `tailscale serve --set-path`; '' for root.
   * Routes answer with or without it, since whether the proxy strips
   * the prefix isn't something the bridge should depend on. */
  basePath,
  /** Shared secret for clients that aren't the owner's own devices. */
  token: env.DEVHUB_BRIDGE_TOKEN || null,
  /** Tailscale login allowed in via `tailscale serve`'s identity
   * header. Defaults to this machine's own login (detected at start). */
  owner: env.DEVHUB_BRIDGE_OWNER || null,
  /** Let direct loopback requests in without a token. Turn off with
   * DEVHUB_BRIDGE_LOOPBACK=0 where other users share the machine. */
  loopback: env.DEVHUB_BRIDGE_LOOPBACK !== '0',
  herdrBin: env.DEVHUB_HERDR_BIN || env.HERDR_BIN_PATH || 'herdr',
  /** The web build of the app (`pnpm web:build`), served to browsers
   * and phones that open the bridge URL directly. */
  webDist:
    env.DEVHUB_WEB_DIST ||
    join(import.meta.dir, '..', '..', 'dist-web'),
};

/** Strip the mount prefix if the proxy left it on. */
export function routePath(pathname: string): string {
  if (config.basePath && pathname.startsWith(config.basePath)) {
    return pathname.slice(config.basePath.length) || '/';
  }
  return pathname;
}
