import type { GitStatus } from '@devhub/shared/hub';

async function git(
  cwd: string,
  args: string[],
  timeoutMs = 10_000,
): Promise<{ ok: boolean; out: string }> {
  const proc = Bun.spawn(['git', '-C', cwd, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  clearTimeout(timer);
  return { ok: code === 0, out };
}

const branchCache = new Map<
  string,
  { at: number; branch: string | null }
>();

/** Current branch for a checkout, cached briefly so snapshot rebuilds
 * stay cheap. */
export async function branchOf(cwd: string): Promise<string | null> {
  const hit = branchCache.get(cwd);
  if (hit && Date.now() - hit.at < 10_000) return hit.branch;
  const { ok, out } = await git(cwd, [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);
  const branch = ok ? out.trim() || null : null;
  branchCache.set(cwd, { at: Date.now(), branch });
  return branch;
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  const root = await git(cwd, ['rev-parse', '--show-toplevel']);
  if (!root.ok) throw new Error('not a git repository');
  const { out } = await git(cwd, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ]);
  return {
    root: root.out.trim(),
    branch: await branchOf(cwd),
    files: out
      .split('\n')
      .filter(Boolean)
      .map((line) => ({
        code: line.slice(0, 2),
        path: line.slice(3).replace(/^.* -> /, ''),
      })),
  };
}

/** Unified diff against HEAD (working tree + index), or the index
 * only when staged. Untracked files diff against /dev/null. */
export async function gitDiff(
  cwd: string,
  path?: string,
  staged = false,
): Promise<string> {
  if (path) {
    const tracked = await git(cwd, [
      'ls-files',
      '--error-unmatch',
      '--',
      path,
    ]);
    if (!tracked.ok) {
      const { out } = await git(cwd, [
        'diff',
        '--no-color',
        '--no-index',
        '--',
        '/dev/null',
        path,
      ]);
      return out;
    }
  }
  const args = ['diff', '--no-color', staged ? '--cached' : 'HEAD'];
  const { out } = await git(cwd, path ? [...args, '--', path] : args);
  return out;
}

/** Tracked + untracked (not ignored) files, for @ mentions. */
export async function listFiles(cwd: string): Promise<string[]> {
  const { ok, out } = await git(cwd, [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
  ]);
  return ok ? out.split('\n').filter(Boolean) : [];
}
