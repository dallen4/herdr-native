import { describe, expect, it } from 'bun:test';
import { answerKeys, askSummary, parsePrompt } from './prompt.ts';

const boxed = `
  ⏺ I'll install the packages.

╭──────────────────────────────────────────────────────────╮
│ Bash command                                             │
│                                                          │
│   pnpm add @ag-ui/core @ag-ui/client                     │
│   Install AG-UI packages                                 │
│                                                          │
│ Do you want to proceed?                                  │
│ ❯ 1. Yes                                                 │
│   2. Yes, and don't ask again for pnpm add commands      │
│   3. No, and tell Claude what to do differently (esc)    │
╰──────────────────────────────────────────────────────────╯
`;

const question = `
────────────────────────────────────────
 Which package manager should I use?

   1. pnpm
 ❯ 2. npm
   3. yarn

 Enter to select · ↑/↓ to navigate · Esc to cancel
`;

describe('parsePrompt', () => {
  it('reads a boxed tool approval', () => {
    const p = parsePrompt(boxed)!;
    expect(p.kind).toBe('approval');
    expect(p.title).toBe('Bash command');
    expect(p.body).toContain('pnpm add @ag-ui/core @ag-ui/client');
    expect(p.body).toContain('Do you want to proceed?');
    expect(p.options.map((o) => o.label)).toEqual([
      'Yes',
      "Yes, and don't ask again for pnpm add commands",
      'No, and tell Claude what to do differently',
    ]);
    expect(p.selected).toBe(1);
    expect(askSummary(p)).toBe(
      'Bash command: pnpm add @ag-ui/core @ag-ui/client',
    );
  });

  it('reads a question with a non-first selection', () => {
    const p = parsePrompt(question)!;
    expect(p.kind).toBe('question');
    expect(p.selected).toBe(2);
    expect(p.options).toHaveLength(3);
  });

  it('ignores numbered lists without a selection marker', () => {
    expect(
      parsePrompt('Steps:\n  1. build\n  2. test\n  3. ship\n'),
    ).toBeNull();
  });

  it('hashes the same menu the same way', () => {
    expect(parsePrompt(boxed)!.hash).toBe(parsePrompt(boxed)!.hash);
    expect(parsePrompt(boxed)!.hash).not.toBe(
      parsePrompt(question)!.hash,
    );
  });
});

describe('answerKeys', () => {
  it('navigates from the selection to the target, then confirms', () => {
    const p = parsePrompt(question)!;
    expect(answerKeys(p, 1)).toEqual(['up', 'enter']);
    expect(answerKeys(p, 3)).toEqual(['down', 'enter']);
    expect(answerKeys(p, 2)).toEqual(['enter']);
  });
});
