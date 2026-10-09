// Claude Code's interactive menus (tool approvals, questions, plan
// confirmation), read off the pane's visible screen.
//
// They render as a block of numbered options with ❯ on the selected
// one, under a question ("Do you want to proceed?") and, for approvals,
// a title and the command. Answers are arrow-key navigation plus Enter,
// never digits: Claude treats some digit keys as shortcuts that skip
// confirmation, and navigation is what a human would do.

import type { PromptInfo } from '@devhub/shared/hub';
import { createHash } from 'node:crypto';

const BOX_EDGE = /^[\s│┃|]+|[\s│┃|]+$/g;
const DIVIDER = /^[\s╭╮╰╯├┤┬┴┼─━═╌▔▁-]+$/;
const OPTION = /^([❯›>])?\s*(\d+)[.)]\s+(.+)$/;

function clean(line: string): string {
  return line.replace(BOX_EDGE, '').replace(/\s+$/, '');
}

export function parsePrompt(screen: string): PromptInfo | null {
  const lines = screen.split('\n').map(clean);

  // The menu is the last run of numbered options on screen.
  let last = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (OPTION.test(lines[i]!.trim())) {
      last = i;
      break;
    }
  }
  if (last === -1) return null;

  const options: { index: number; label: string }[] = [];
  let selected = -1;
  let first = last;
  for (let i = last; i >= 0; i--) {
    const trimmed = lines[i]!.trim();
    const m = trimmed.match(OPTION);
    if (!m) {
      // option labels can wrap onto an indented continuation line
      if (trimmed && !DIVIDER.test(trimmed) && i > 0) {
        const above = lines[i - 1]!.trim();
        if (OPTION.test(above)) continue;
      }
      break;
    }
    first = i;
    const index = Number(m[2]);
    options.unshift({
      index,
      label: m[3]!.replace(/\s+\(esc\)$/, ''),
    });
    if (m[1]) selected = index;
  }
  if (options.length < 2 || selected === -1) return null;
  // numbering must run 1..n with no gaps, or this isn't a menu
  if (options.some((o, i) => o.index !== i + 1)) return null;

  // Above the options: the question, then (for approvals) the body and
  // a title, back to the previous divider.
  const above: string[] = [];
  for (let i = first - 1; i >= 0 && above.length < 14; i--) {
    const trimmed = lines[i]!.trim();
    if (DIVIDER.test(trimmed) && trimmed.length > 0) break;
    above.unshift(trimmed);
  }
  while (above.length && !above[0]) above.shift();
  const nonEmpty = above.filter(Boolean);
  const question = nonEmpty.at(-1) ?? '';
  const title = nonEmpty.length > 1 ? nonEmpty[0]! : question;
  const body = nonEmpty.slice(1, -1).join('\n');

  const text = `${title}\n${body}\n${question}`.toLowerCase();
  const kind: PromptInfo['kind'] = /plan/.test(text)
    ? 'plan'
    : /do you want|proceed|allow|permission|make this edit/.test(text)
      ? 'approval'
      : /trust/.test(text)
        ? 'confirm'
        : 'question';

  const hash = createHash('sha1')
    .update(JSON.stringify([title, body, question, options]))
    .digest('hex')
    .slice(0, 16);

  return {
    hash,
    kind,
    title: title === question ? question : title,
    body: [body, title === question ? '' : question]
      .filter(Boolean)
      .join('\n'),
    options,
    selected,
  };
}

/** Keys that move the selection to `target` and confirm it. */
export function answerKeys(
  prompt: PromptInfo,
  target: number,
): string[] {
  const delta = target - prompt.selected;
  const step = delta > 0 ? 'down' : 'up';
  return [...Array(Math.abs(delta)).fill(step), 'enter'];
}

/** One line for the hub's "needs you" list. */
export function askSummary(prompt: PromptInfo): string {
  const firstBody = prompt.body.split('\n').find(Boolean);
  if (prompt.kind === 'approval' && firstBody) {
    return `${prompt.title}: ${firstBody}`;
  }
  return firstBody ?? prompt.title;
}
