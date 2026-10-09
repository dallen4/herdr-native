// Shaping an AG-UI message list for the chat view: turns (a prompt plus
// everything the agent did in response), tool steps with their results,
// and the agent's current plan.

import type { Message } from '@devhub/shared/agui';

export interface ToolStep {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** One line describing what the call did. */
  summary: string;
  /** A file the call touched, for opening in the viewer. */
  file: string | null;
  status: 'loading' | 'success' | 'error';
  result: string | null;
}

export type Block =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'reasoning'; id: string; text: string }
  | { kind: 'tools'; id: string; steps: ToolStep[] };

export interface Turn {
  id: string;
  prompt: string | null;
  blocks: Block[];
}

export interface PlanItem {
  label: string;
  state: 'done' | 'active' | 'todo';
}

const text = (content: unknown) =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .map((p: { type?: string; text?: string }) =>
            p?.type === 'text' ? (p.text ?? '') : '',
          )
          .join('')
      : '';

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function summarize(
  name: string,
  args: Record<string, unknown>,
): { summary: string; file: string | null } {
  const file =
    str(args.file_path) || str(args.notebook_path) || str(args.path);
  switch (name) {
    case 'Bash':
      return { summary: str(args.command), file: null };
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { summary: file, file: file || null };
    case 'Grep':
      return {
        summary: `${str(args.pattern)}${file ? ` in ${file}` : ''}`,
        file: null,
      };
    case 'Glob':
      return { summary: str(args.pattern), file: null };
    case 'WebFetch':
      return { summary: str(args.url), file: null };
    case 'WebSearch':
      return { summary: str(args.query), file: null };
    case 'Task':
    case 'Agent':
      return {
        summary:
          str(args.description) || str(args.prompt).slice(0, 80),
        file: null,
      };
    case 'TodoWrite':
      return { summary: 'updated the plan', file: null };
    default: {
      const first = Object.values(args).find(
        (v) => typeof v === 'string',
      );
      return { summary: str(first).slice(0, 120), file: null };
    }
  }
}

export function toTurns(messages: Message[]): Turn[] {
  const results = new Map<
    string,
    { content: string; error: boolean }
  >();
  for (const m of messages) {
    if (m.role === 'tool') {
      results.set(m.toolCallId, {
        content: text(m.content),
        error: !!m.error,
      });
    }
  }

  const turns: Turn[] = [];
  let current: Turn | null = null;
  const ensure = (id: string) => {
    if (!current) {
      current = { id, prompt: null, blocks: [] };
      turns.push(current);
    }
    return current;
  };

  for (const m of messages) {
    if (m.role === 'user') {
      current = { id: m.id, prompt: text(m.content), blocks: [] };
      turns.push(current);
      continue;
    }
    if (m.role === 'reasoning') {
      if (m.content.trim()) {
        ensure(m.id).blocks.push({
          kind: 'reasoning',
          id: m.id,
          text: m.content,
        });
      }
      continue;
    }
    if (m.role !== 'assistant') continue;
    const turn = ensure(m.id);
    const body = text(m.content);
    if (body.trim()) {
      turn.blocks.push({ kind: 'text', id: m.id, text: body });
    }
    for (const call of m.toolCalls ?? []) {
      const args = parseArgs(call.function.arguments);
      const res = results.get(call.id);
      const step: ToolStep = {
        id: call.id,
        name: call.function.name,
        args,
        ...summarize(call.function.name, args),
        status: !res ? 'loading' : res.error ? 'error' : 'success',
        result: res?.content ?? null,
      };
      const last = turn.blocks.at(-1);
      if (last?.kind === 'tools') last.steps.push(step);
      else
        turn.blocks.push({
          kind: 'tools',
          id: call.id,
          steps: [step],
        });
    }
  }
  return turns;
}

/** The latest TodoWrite plan in the session. */
export function latestPlan(messages: Message[]): PlanItem[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== 'assistant') continue;
    for (const call of [...(m.toolCalls ?? [])].reverse()) {
      if (call.function.name !== 'TodoWrite') continue;
      const todos = parseArgs(call.function.arguments).todos;
      if (!Array.isArray(todos)) return [];
      return todos.map(
        (t: { content?: string; status?: string }) => ({
          label: t.content ?? '',
          state:
            t.status === 'completed'
              ? 'done'
              : t.status === 'in_progress'
                ? 'active'
                : 'todo',
        }),
      );
    }
  }
  return [];
}
