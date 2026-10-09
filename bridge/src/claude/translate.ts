// Claude Code transcript entries → AG-UI events.
//
// A transcript is JSONL: one entry per line. Assistant entries carry a
// single content block each (text, thinking, tool_use) and share their
// API message id; user entries carry either the human's prompt or
// tool_result blocks. Sidechain (subagent) entries, meta entries and
// compaction summaries aren't part of the visible conversation.

import { EventType, type BaseEvent } from '@devhub/shared/agui';
import type { SessionMeta } from '@devhub/shared/hub';

interface Block {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

interface Entry {
  type?: string;
  uuid?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  message?: {
    role?: string;
    model?: string;
    content?: string | Block[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

const MAX_RESULT_CHARS = 20_000;

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: Block) =>
        part?.type === 'text'
          ? (part.text ?? '')
          : part?.type === 'image'
            ? '[image]'
            : '',
      )
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/** What the human typed, or null for entries that aren't prompts
 * (command plumbing, hook output, reminders). Slash commands come back
 * as "/name args". */
export function userPromptText(content: string): string | null {
  const command = content.match(
    /<command-name>(.*?)<\/command-name>/s,
  );
  if (command) {
    const args = content
      .match(/<command-args>(.*?)<\/command-args>/s)?.[1]
      ?.trim();
    const name = command[1]!.trim();
    return args ? `${name} ${args}` : name;
  }
  const trimmed = content.trimStart();
  if (
    trimmed.startsWith('<local-command') ||
    trimmed.startsWith('<command-') ||
    trimmed.startsWith('<task-') ||
    trimmed.startsWith('<system-reminder') ||
    trimmed.startsWith('Caveat:')
  ) {
    return null;
  }
  return content;
}

export class TranscriptTranslator {
  readonly meta: SessionMeta = {
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    turns: 0,
  };
  private seenUsage = new Set<string>();
  private blockCounter = new Map<string, number>();

  /** Translate one parsed transcript line. */
  translate(entry: Entry): BaseEvent[] {
    if (!entry || entry.isSidechain || entry.isMeta) return [];
    if (entry.isCompactSummary) return [];
    const msg = entry.message;
    if (!msg || !entry.uuid) return [];

    if (entry.type === 'assistant') return this.assistant(entry);
    if (entry.type === 'user') return this.user(entry);
    return [];
  }

  private assistant(entry: Entry): BaseEvent[] {
    const msg = entry.message!;
    if (msg.model && msg.model !== '<synthetic>') {
      this.meta.model = msg.model;
    }
    const usageKey = entry.uuid!;
    if (msg.usage && !this.seenUsage.has(usageKey)) {
      this.seenUsage.add(usageKey);
      this.meta.inputTokens +=
        (msg.usage.input_tokens ?? 0) +
        (msg.usage.cache_read_input_tokens ?? 0) +
        (msg.usage.cache_creation_input_tokens ?? 0);
      this.meta.outputTokens += msg.usage.output_tokens ?? 0;
    }
    const blocks = Array.isArray(msg.content) ? msg.content : [];
    const events: BaseEvent[] = [];
    for (const block of blocks) {
      const n = (this.blockCounter.get(entry.uuid!) ?? 0) + 1;
      this.blockCounter.set(entry.uuid!, n);
      const id = n === 1 ? entry.uuid! : `${entry.uuid}:${n}`;
      if (block.type === 'text' && block.text?.trim()) {
        events.push(
          {
            type: EventType.TEXT_MESSAGE_START,
            messageId: id,
            role: 'assistant',
          } as BaseEvent,
          {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: id,
            delta: block.text,
          } as BaseEvent,
          {
            type: EventType.TEXT_MESSAGE_END,
            messageId: id,
          } as BaseEvent,
        );
      } else if (block.type === 'tool_use' && block.id) {
        events.push(
          {
            type: EventType.TOOL_CALL_START,
            toolCallId: block.id,
            toolCallName: block.name ?? 'tool',
            parentMessageId: id,
          } as BaseEvent,
          {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: block.id,
            delta: JSON.stringify(block.input ?? {}),
          } as BaseEvent,
          {
            type: EventType.TOOL_CALL_END,
            toolCallId: block.id,
          } as BaseEvent,
        );
      } else if (
        block.type === 'thinking' &&
        block.thinking?.trim()
      ) {
        // Most thinking is redacted to a signature; show what's readable.
        events.push(
          {
            type: EventType.REASONING_MESSAGE_START,
            messageId: id,
            role: 'reasoning',
          } as BaseEvent,
          {
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId: id,
            delta: block.thinking,
          } as BaseEvent,
          {
            type: EventType.REASONING_MESSAGE_END,
            messageId: id,
          } as BaseEvent,
        );
      }
    }
    return events;
  }

  private user(entry: Entry): BaseEvent[] {
    const content = entry.message!.content;
    if (typeof content === 'string') {
      const text = userPromptText(content);
      if (!text?.trim()) return [];
      this.meta.turns += 1;
      return this.userText(entry.uuid!, text);
    }
    if (!Array.isArray(content)) return [];
    const events: BaseEvent[] = [];
    const texts: string[] = [];
    for (const block of content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        const text = resultText(block.content);
        events.push({
          type: EventType.TOOL_CALL_RESULT,
          messageId: `${entry.uuid}:${block.tool_use_id}`,
          toolCallId: block.tool_use_id,
          content:
            text.length > MAX_RESULT_CHARS
              ? `${text.slice(0, MAX_RESULT_CHARS)}\n… (truncated)`
              : text,
          role: 'tool',
          ...(block.is_error ? { metadata: { error: true } } : {}),
        } as BaseEvent);
      } else if (block.type === 'text' && block.text) {
        const text = userPromptText(block.text);
        if (text) texts.push(text);
      } else if (block.type === 'image') {
        texts.push('[image]');
      }
    }
    if (texts.length) {
      this.meta.turns += 1;
      events.unshift(...this.userText(entry.uuid!, texts.join('\n')));
    }
    return events;
  }

  private userText(id: string, text: string): BaseEvent[] {
    return [
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: id,
        role: 'user',
      } as BaseEvent,
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: id,
        delta: text,
      } as BaseEvent,
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: id,
      } as BaseEvent,
    ];
  }
}
