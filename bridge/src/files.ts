// Read-only file access for the viewer, slash-command discovery, @
// mention search, and pasted-image saving. Paths are confined to the
// user's home directory.

import type { FileContent, FileEntry } from '@devhub/shared/hub';
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { listFiles } from './git.ts';

const MAX_TEXT = 2 * 1024 * 1024;
const MAX_IMAGE = 8 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export class FsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function confine(path: string): Promise<string> {
  const home = await realpath(homedir());
  let real: string;
  try {
    real = await realpath(resolve(path.replace(/^~(?=$|\/)/, home)));
  } catch {
    throw new FsError('not_found', `no such path: ${path}`);
  }
  if (real !== home && !real.startsWith(home + sep)) {
    throw new FsError('forbidden', 'outside the home directory');
  }
  return real;
}

export async function listDir(path: string): Promise<FileEntry[]> {
  const dir = await confine(path);
  const entries = await readdir(dir, { withFileTypes: true });
  const out: FileEntry[] = [];
  for (const e of entries) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    const isDir = e.isDirectory();
    let size = 0;
    if (!isDir) {
      try {
        size = (await stat(full)).size;
      } catch {
        continue;
      }
    }
    out.push({
      name: e.name,
      path: full,
      kind: isDir ? 'dir' : 'file',
      size,
    });
  }
  return out.sort((a, b) =>
    a.kind === b.kind
      ? a.name.localeCompare(b.name)
      : a.kind === 'dir'
        ? -1
        : 1,
  );
}

export async function readFileContent(
  path: string,
): Promise<FileContent> {
  const file = await confine(path);
  const { size } = await stat(file);
  const mime = IMAGE_TYPES[extname(file).toLowerCase()];
  if (mime) {
    if (size > MAX_IMAGE) {
      return { path: file, kind: 'too_large', size, content: '' };
    }
    const data = await readFile(file);
    return {
      path: file,
      kind: 'image',
      size,
      content: `data:${mime};base64,${data.toString('base64')}`,
    };
  }
  if (size > MAX_TEXT) {
    return { path: file, kind: 'too_large', size, content: '' };
  }
  const data = await readFile(file);
  if (data.subarray(0, 8000).includes(0)) {
    return { path: file, kind: 'binary', size, content: '' };
  }
  return {
    path: file,
    kind: 'text',
    size,
    content: data.toString('utf8'),
  };
}

/** Save a pasted image beside the pane's work, for the agent to read
 * by path. */
export async function saveImage(
  cwd: string,
  name: string,
  dataUrl: string,
): Promise<string> {
  const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!match)
    throw new FsError('bad_image', 'expected an image data URL');
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length > MAX_IMAGE) {
    throw new FsError('too_large', 'images are limited to 8MB');
  }
  const dir = join(await confine(cwd), '.devhub', 'attachments');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const safe =
    name.replace(/[^\w.-]+/g, '_').slice(-80) || 'image.png';
  const path = join(dir, `${Date.now()}-${safe}`);
  await writeFile(path, bytes, { mode: 0o600 });
  return path;
}

// ---- @ mentions ------------------------------------------------------

const fileCache = new Map<string, { at: number; files: string[] }>();

export async function searchFiles(
  cwd: string,
  query: string,
): Promise<string[]> {
  let hit = fileCache.get(cwd);
  if (!hit || Date.now() - hit.at > 5_000) {
    hit = { at: Date.now(), files: await listFiles(cwd) };
    fileCache.set(cwd, hit);
  }
  const q = query.toLowerCase();
  if (!q) return hit.files.slice(0, 30);
  const scored = hit.files
    .map((f) => {
      const lower = f.toLowerCase();
      const base = lower.slice(lower.lastIndexOf('/') + 1);
      const score = base.startsWith(q)
        ? 0
        : base.includes(q)
          ? 1
          : lower.includes(q)
            ? 2
            : -1;
      return { f, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || a.f.length - b.f.length);
  return scored.slice(0, 30).map((x) => x.f);
}
