import type { Message } from '@devhub/shared/agui';
import { describe, expect, it } from 'vitest';
import { latestPlan, summarize, toTurns } from './turns.ts';

const call = (id: string, name: string, args: unknown) => ({
  id,
  type: 'function' as const,
  function: { name, arguments: JSON.stringify(args) },
});

const messages: Message[] = [
  { id: 'u1', role: 'user', content: 'fix it' },
  { id: 'a1', role: 'assistant', content: 'On it.' },
  {
    id: 'a2',
    role: 'assistant',
    toolCalls: [call('t1', 'Read', { file_path: 'src/a.ts' })],
  },
  { id: 'r1', role: 'tool', toolCallId: 't1', content: 'ok' },
  {
    id: 'a3',
    role: 'assistant',
    toolCalls: [call('t2', 'Bash', { command: 'pnpm test' })],
  },
  { id: 'a4', role: 'assistant', content: 'Done.' },
  { id: 'u2', role: 'user', content: 'thanks' },
];

describe('toTurns', () => {
  it('groups prompts with the work that answered them', () => {
    const turns = toTurns(messages);
    expect(turns.map((t) => t.prompt)).toEqual(['fix it', 'thanks']);
    const blocks = turns[0]!.blocks;
    expect(blocks.map((b) => b.kind)).toEqual([
      'text',
      'tools',
      'text',
    ]);
    const tools = blocks[1]!;
    expect(tools.kind === 'tools' && tools.steps).toMatchObject([
      {
        name: 'Read',
        summary: 'src/a.ts',
        file: 'src/a.ts',
        status: 'success',
      },
      { name: 'Bash', summary: 'pnpm test', status: 'loading' },
    ]);
  });
});

describe('reasoning', () => {
  it('becomes its own block inside the turn', () => {
    const turns = toTurns([
      { id: 'u', role: 'user', content: 'go' },
      { id: 'r', role: 'reasoning', content: 'thinking it over' },
      { id: 'a', role: 'assistant', content: 'done' },
    ]);
    expect(turns[0]!.blocks.map((b) => b.kind)).toEqual([
      'reasoning',
      'text',
    ]);
  });
});

describe('summarize', () => {
  it('describes common tools by their key argument', () => {
    expect(
      summarize('Grep', { pattern: 'TODO', path: 'src' }),
    ).toEqual({
      summary: 'TODO in src',
      file: null,
    });
  });
});

describe('latestPlan', () => {
  it('reads the most recent TodoWrite', () => {
    const plan = latestPlan([
      {
        id: 'a',
        role: 'assistant',
        toolCalls: [
          call('t', 'TodoWrite', {
            todos: [
              { content: 'one', status: 'completed' },
              { content: 'two', status: 'in_progress' },
              { content: 'three', status: 'pending' },
            ],
          }),
        ],
      },
    ]);
    expect(plan.map((p) => p.state)).toEqual([
      'done',
      'active',
      'todo',
    ]);
  });
});
