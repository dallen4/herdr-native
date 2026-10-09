// Claude plan usage for the account Claude Code is signed into on this
// server: how much of the 5-hour session and weekly limits is used, and
// when each resets.
//
// The approach (keychain item, credentials file, usage endpoint) follows
// herdr-web-ui (https://github.com/devswha/herdr-web-ui),
// server/usage.ts. Copyright (c) 2026 devswha. MIT License; see
// THIRD_PARTY_NOTICES.md.
//
// Read-only: the token is never refreshed (Claude Code rotates refresh
// tokens, and a refresh it didn't make would sign it out). An expired
// token just means "unknown" until Claude Code renews it. Answers are
// cached, and a 429 is honored.

import type { ClaudeUsage, UsageWindow } from '@devhub/shared/hub';
import { readFile } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';

const FRESH_MS = 5 * 60_000;
const ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';

interface SignIn {
  token: string;
  expiresAt: number | null;
  plan: string | null;
}

function parseSignIn(raw: string | null): SignIn | null {
  if (!raw) return null;
  try {
    const oauth = JSON.parse(raw)?.claudeAiOauth;
    if (typeof oauth?.accessToken !== 'string') return null;
    return {
      token: oauth.accessToken,
      expiresAt:
        typeof oauth.expiresAt === 'number' ? oauth.expiresAt : null,
      plan:
        typeof oauth.subscriptionType === 'string'
          ? oauth.subscriptionType
          : null,
    };
  } catch {
    return null;
  }
}

async function fromKeychain(): Promise<SignIn | null> {
  if (process.platform !== 'darwin') return null;
  for (const account of [userInfo().username, undefined]) {
    const proc = Bun.spawn(
      [
        '/usr/bin/security',
        'find-generic-password',
        '-s',
        'Claude Code-credentials',
        ...(account ? ['-a', account] : []),
        '-w',
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' },
    );
    const timer = setTimeout(() => proc.kill(), 5_000);
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    clearTimeout(timer);
    if (code === 0) {
      const signIn = parseSignIn(out.trim());
      if (signIn) return signIn;
    }
  }
  return null;
}

async function fromFile(): Promise<SignIn | null> {
  const dir =
    process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  try {
    return parseSignIn(
      await readFile(join(dir, '.credentials.json'), 'utf8'),
    );
  } catch {
    return null;
  }
}

function toWindow(value: unknown): UsageWindow | null {
  const w = value as {
    utilization?: unknown;
    resets_at?: unknown;
  } | null;
  if (!w || typeof w.utilization !== 'number') return null;
  const used = Math.round(Math.min(100, Math.max(0, w.utilization)));
  let resetsAt: string | null = null;
  if (typeof w.resets_at === 'string') {
    const t = Date.parse(w.resets_at);
    resetsAt = Number.isNaN(t) ? null : new Date(t).toISOString();
  } else if (typeof w.resets_at === 'number') {
    const n = w.resets_at;
    resetsAt = new Date(n < 1e12 ? n * 1000 : n).toISOString();
  }
  return { usedPercent: used, resetsAt };
}

let cached: { at: number; value: ClaudeUsage | null } | null = null;
let blockedUntil = 0;
let inflight: Promise<ClaudeUsage | null> | null = null;

async function fetchUsage(): Promise<ClaudeUsage | null> {
  const signIn = (await fromKeychain()) ?? (await fromFile());
  if (!signIn) return null;
  if (signIn.expiresAt && signIn.expiresAt < Date.now()) return null;
  const res = await fetch(ENDPOINT, {
    headers: {
      authorization: `Bearer ${signIn.token}`,
      accept: 'application/json',
      'anthropic-beta': 'oauth-2025-04-20',
      'user-agent': 'devhub-bridge',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 429) {
    const after = Number(res.headers.get('retry-after'));
    blockedUntil =
      Date.now() +
      (Number.isFinite(after) && after > 0 ? after : 300) * 1000;
    return cached?.value ?? null;
  }
  if (!res.ok) return null;
  const body = (await res.json()) as Record<string, unknown>;
  return {
    plan: signIn.plan,
    session: toWindow(body.five_hour),
    week: toWindow(body.seven_day),
    fetchedAt: new Date().toISOString(),
  };
}

export async function claudeUsage(
  force = false,
): Promise<ClaudeUsage | null> {
  const now = Date.now();
  if (now < blockedUntil) return cached?.value ?? null;
  // a forced refresh still waits at least 30s between real requests
  const maxAge = force ? 30_000 : FRESH_MS;
  if (cached && now - cached.at < maxAge) return cached.value;
  inflight ??= fetchUsage()
    .catch(() => cached?.value ?? null)
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
