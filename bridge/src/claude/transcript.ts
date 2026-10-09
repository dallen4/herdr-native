// Finding and tailing a Claude Code transcript.
//
// The project-directory encoding is from herdr-web-ui
// (https://github.com/devswha/herdr-web-ui), server/claude-store.ts.
// Copyright (c) 2026 devswha. MIT License; see THIRD_PARTY_NOTICES.md.

import { open, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MAX_PROJECT_NAME = 200;
const POLL_MS = 400;

function stringHash(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash;
}

/** Claude Code's encoding of the directory a session started in:
 * every non-alphanumeric character becomes "-", and long names get a
 * hash suffix. */
export function claudeProjectDir(cwd: string): string {
  const name = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  if (name.length <= MAX_PROJECT_NAME) return name;
  return `${name.slice(0, MAX_PROJECT_NAME)}-${Math.abs(
    stringHash(cwd),
  ).toString(36)}`;
}

const projectsRoot = () =>
  join(
    process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'),
    'projects',
  );

async function isFile(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

const found = new Map<string, string>();

/** The transcript for a session: the pane's cwd is the fast path, but
 * Claude may have started elsewhere, so a miss scans every project. */
export async function locateTranscript(
  sessionId: string,
  cwd: string | null,
): Promise<string | null> {
  const file = `${sessionId}.jsonl`;
  const cached = found.get(sessionId);
  if (cached && (await isFile(cached))) return cached;
  const root = projectsRoot();
  if (cwd) {
    const direct = join(root, claudeProjectDir(cwd), file);
    if (await isFile(direct)) {
      found.set(sessionId, direct);
      return direct;
    }
  }
  try {
    for (const dir of await readdir(root)) {
      const path = join(root, dir, file);
      if (await isFile(path)) {
        found.set(sessionId, path);
        return path;
      }
    }
  } catch {
    // no projects directory yet
  }
  return null;
}

/** Polls a JSONL file and hands over each complete new line, parsed. */
export class Tailer {
  private offset = 0;
  private partial = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  private reading = false;

  constructor(
    private readonly path: string,
    private readonly onEntries: (entries: unknown[]) => void,
    private readonly onReset: () => void,
  ) {}

  async start() {
    await this.read();
    this.timer = setInterval(() => void this.read(), POLL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async read() {
    if (this.reading) return;
    this.reading = true;
    try {
      const size = (await stat(this.path)).size;
      if (size < this.offset) {
        // rewritten underneath us: start over
        this.offset = 0;
        this.partial = '';
        this.onReset();
      }
      if (size === this.offset) return;
      const handle = await open(this.path, 'r');
      try {
        const length = size - this.offset;
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, this.offset);
        this.offset = size;
        const text = this.partial + buffer.toString('utf8');
        const lines = text.split('\n');
        this.partial = lines.pop() ?? '';
        const entries: unknown[] = [];
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            entries.push(JSON.parse(line));
          } catch {
            // a torn line; skip it
          }
        }
        if (entries.length) this.onEntries(entries);
      } finally {
        await handle.close();
      }
    } catch {
      // file vanished or unreadable; keep polling
    } finally {
      this.reading = false;
    }
  }
}
