import { applyEvents, type Message } from '@devhub/shared/agui';
import { describe, expect, it } from 'bun:test';
import { TranscriptTranslator, userPromptText } from './translate.ts';

const entries = [
  {
    type: 'user',
    uuid: 'u1',
    message: { role: 'user', content: 'fix the bug' },
  },
  {
    type: 'assistant',
    uuid: 'a1',
    message: {
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text: 'Looking now.' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  },
  {
    type: 'assistant',
    uuid: 'a2',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'Read',
          input: { file_path: 'src/a.ts' },
        },
      ],
    },
  },
  {
    type: 'user',
    uuid: 'u2',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          content: 'export const a = 1;',
        },
      ],
    },
  },
  {
    type: 'user',
    uuid: 'm1',
    isMeta: true,
    message: { content: 'x' },
  },
  {
    type: 'assistant',
    uuid: 's1',
    isSidechain: true,
    message: { content: [{ type: 'text', text: 'subagent' }] },
  },
];

describe('TranscriptTranslator', () => {
  it('turns a transcript into AG-UI messages', () => {
    const t = new TranscriptTranslator();
    const events = entries.flatMap((e) => t.translate(e));
    const messages: Message[] = applyEvents([], events);

    expect(messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'assistant',
      'tool',
    ]);
    expect(messages[0]!.content).toBe('fix the bug');
    expect(messages[1]!.content).toBe('Looking now.');
    const call = messages[2]!;
    expect(
      call.role === 'assistant' && call.toolCalls?.[0],
    ).toMatchObject({
      id: 'toolu_1',
      function: {
        name: 'Read',
        arguments: '{"file_path":"src/a.ts"}',
      },
    });
    expect(messages[3]).toMatchObject({
      role: 'tool',
      toolCallId: 'toolu_1',
      content: 'export const a = 1;',
    });
    expect(t.meta).toEqual({
      model: 'claude-opus-5-5',
      inputTokens: 10,
      outputTokens: 5,
      turns: 1,
    });
  });
});

describe('thinking', () => {
  it('becomes a reasoning message when readable, and nothing when redacted', () => {
    const t = new TranscriptTranslator();
    const events = [
      {
        type: 'assistant',
        uuid: 'r1',
        message: {
          content: [
            { type: 'thinking', thinking: 'weighing options' },
          ],
        },
      },
      {
        type: 'assistant',
        uuid: 'r2',
        message: { content: [{ type: 'thinking', thinking: '' }] },
      },
    ].flatMap((e) => t.translate(e));
    const messages = applyEvents([], events);
    expect(messages).toEqual([
      { id: 'r1', role: 'reasoning', content: 'weighing options' },
    ]);
  });
});

describe('userPromptText', () => {
  it('shows slash commands as typed', () => {
    expect(
      userPromptText(
        '<command-name>/init</command-name><command-args>be brief</command-args>',
      ),
    ).toBe('/init be brief');
  });

  it('hides command plumbing and reminders', () => {
    expect(userPromptText('<local-command-stdout>ok')).toBeNull();
    expect(userPromptText('<system-reminder>x')).toBeNull();
    expect(userPromptText('hello')).toBe('hello');
  });
});
