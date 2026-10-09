// Every slash command Claude Code offers: its built-ins, read from the
// installed binary so the list tracks Claude Code updates (/voice,
// /usage, /btw…), plus user and project commands, skills, and the
// commands and skills of enabled plugins.
//
// Plugin and skill discovery follows herdr-web-ui
// (https://github.com/devswha/herdr-web-ui), server/commands.ts.
// Copyright (c) 2026 devswha. MIT License; see THIRD_PARTY_NOTICES.md.

import type { SlashCommand } from '@devhub/shared/hub';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';

// Built-in commands are objects like
//   {type:"local",name:"voice",description:"Toggle voice mode",…}
// The type tag separates them from tool and CLI-flag definitions that
// share the name/description shape.
// Other properties (aliases, flags) may sit between name and
// description; [^{}] keeps a match inside one object.
const BUILTIN =
  /type:"(?:local|local-jsx|prompt)",name:"([a-z][a-z0-9-]{0,40})",(?:[^{}]{0,300}?,)?description:"((?:[^"\\]|\\.){1,200})"/g;

const FALLBACK: [string, string][] = [
  ['clear', 'Start a new session with empty context'],
  ['compact', 'Free up context by summarizing the conversation'],
  ['context', 'Visualize current context usage'],
  ['model', 'Set the model'],
  ['usage', 'Show session cost, plan usage, and activity stats'],
  ['resume', 'Resume a previous conversation'],
  ['help', 'Show help and available commands'],
];

/** Parse the built-in command table out of Claude Code's bundle. */
export function parseBuiltins(bundle: string): SlashCommand[] {
  const seen = new Map<string, SlashCommand>();
  for (const m of bundle.matchAll(BUILTIN)) {
    const name = m[1]!;
    const description = m[2]!.replace(/\\(.)/g, '$1');
    if (seen.has(name)) continue;
    // retired commands linger in the table with a note
    if (/^\((removed|deprecated)\)|^Renamed to /i.test(description))
      continue;
    seen.set(name, {
      name: `/${name}`,
      description,
      source: 'builtin',
    });
  }
  return [...seen.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

async function claudeBinary(): Promise<string | null> {
  const candidates = [
    Bun.which('claude'),
    join(homedir(), '.local', 'bin', 'claude'),
    join(homedir(), '.claude', 'local', 'claude'),
  ].filter((p): p is string => !!p);
  for (const c of candidates) {
    try {
      return await realpath(c);
    } catch {
      // not here
    }
  }
  return null;
}

let builtinCache: { key: string; commands: SlashCommand[] } | null =
  null;

async function builtins(): Promise<SlashCommand[]> {
  const bin = await claudeBinary();
  if (bin) {
    try {
      const { mtimeMs, size } = await stat(bin);
      const key = `${bin}:${mtimeMs}:${size}`;
      if (builtinCache?.key === key) return builtinCache.commands;
      // the bundle is embedded as text in the binary; latin1 keeps every
      // byte so offsets and ASCII matches survive
      const text = (await readFile(bin)).toString('latin1');
      const commands = parseBuiltins(text);
      if (commands.length > 10) {
        builtinCache = { key, commands };
        return commands;
      }
    } catch {
      // unreadable binary: fall back
    }
  }
  return FALLBACK.map(([name, description]) => ({
    name: `/${name}`,
    description,
    source: 'builtin',
  }));
}

function frontmatter(text: string, key: string): string | null {
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  return (
    fm?.[1]
      ?.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]
      ?.trim() ?? null
  );
}

function firstLine(text: string): string {
  return (
    text
      .replace(/^---[\s\S]*?---/, '')
      .split('\n')
      .find((l) => l.trim())
      ?.replace(/^#+\s*/, '')
      .trim() ?? ''
  );
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** `.md` command files, nested folders joined with ":". */
async function commandFiles(
  root: string,
  source: SlashCommand['source'],
  prefix = '',
): Promise<SlashCommand[]> {
  if (!(await exists(root))) return [];
  const out: SlashCommand[] = [];
  async function walk(dir: string) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith('.md')) {
        const name = relative(root, full)
          .slice(0, -3)
          .split(sep)
          .join(':');
        const text = (
          await readFile(full, 'utf8').catch(() => '')
        ).slice(0, 4000);
        out.push({
          name: `/${prefix}${name}`,
          description:
            frontmatter(text, 'description') ?? firstLine(text),
          source,
        });
      }
    }
  }
  await walk(root);
  return out;
}

/** Skills: one folder per skill with a SKILL.md, invoked as /name. */
async function skillDirs(
  root: string,
  source: SlashCommand['source'],
  prefix = '',
): Promise<SlashCommand[]> {
  if (!(await exists(root))) return [];
  const out: SlashCommand[] = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue;
    const text = await readFile(
      join(root, e.name, 'SKILL.md'),
      'utf8',
    ).catch(() => null);
    if (text === null) continue;
    const name = frontmatter(text, 'name') ?? e.name;
    out.push({
      name: `/${prefix}${name}`,
      description:
        frontmatter(text, 'description') ?? firstLine(text),
      source,
    });
  }
  return out;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function pluginCommands(home: string): Promise<SlashCommand[]> {
  const settings = await readJson<{
    enabledPlugins?: Record<string, unknown>;
  }>(join(home, '.claude', 'settings.json'));
  const installed = await readJson<{
    plugins?: Record<string, { installPath?: unknown }[]>;
  }>(join(home, '.claude', 'plugins', 'installed_plugins.json'));
  const out: SlashCommand[] = [];
  for (const [id, on] of Object.entries(
    settings?.enabledPlugins ?? {},
  )) {
    if (on !== true) continue;
    const path = installed?.plugins?.[id]?.[0]?.installPath;
    if (typeof path !== 'string') continue;
    const plugin = id.split('@')[0]!;
    out.push(
      ...(await skillDirs(
        join(path, 'skills'),
        'plugin',
        `${plugin}:`,
      )),
      ...(await commandFiles(
        join(path, 'commands'),
        'plugin',
        `${plugin}:`,
      )),
    );
  }
  return out;
}

export async function slashCommands(
  cwd: string | null,
): Promise<SlashCommand[]> {
  const home = homedir();
  const groups = await Promise.all([
    cwd
      ? commandFiles(join(cwd, '.claude', 'commands'), 'project')
      : [],
    cwd ? skillDirs(join(cwd, '.claude', 'skills'), 'project') : [],
    commandFiles(join(home, '.claude', 'commands'), 'user'),
    skillDirs(join(home, '.claude', 'skills'), 'user'),
    pluginCommands(home),
    builtins(),
  ]);
  const seen = new Set<string>();
  return groups.flat().filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
}
