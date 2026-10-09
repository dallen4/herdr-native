// A small AG-UI message reducer, shared so the bridge (which builds
// MESSAGES_SNAPSHOTs) and the app (which applies live events) can never
// disagree about what a stream of events means.

import {
  EventType,
  type BaseEvent,
  type CustomEvent,
  type Message,
  type MessagesSnapshotEvent,
  type ReasoningMessageContentEvent,
  type ReasoningMessageStartEvent,
  type TextMessageContentEvent,
  type TextMessageStartEvent,
  type ToolCallArgsEvent,
  type ToolCallResultEvent,
  type ToolCallStartEvent,
} from '@ag-ui/core';

export type { BaseEvent, Message } from '@ag-ui/core';
export { EventType } from '@ag-ui/core';

type Assistant = Extract<Message, { role: 'assistant' }>;

function upsertAssistant(messages: Message[], id: string): Assistant {
  const found = messages.find(
    (m): m is Assistant => m.id === id && m.role === 'assistant',
  );
  if (found) return found;
  const created: Assistant = { id, role: 'assistant', toolCalls: [] };
  messages.push(created);
  return created;
}

/** Applies events to a message list. Returns a new array, and any
 * message an event changes is replaced, so React sees the change. */
export function applyEvents(
  current: Message[],
  events: BaseEvent[],
): Message[] {
  let messages = current.slice();

  for (const event of events) {
    switch (event.type) {
      case EventType.MESSAGES_SNAPSHOT:
        messages = (event as MessagesSnapshotEvent).messages.slice();
        break;
      case EventType.TEXT_MESSAGE_START: {
        const e = event as TextMessageStartEvent;
        if (messages.some((m) => m.id === e.messageId)) break;
        messages.push(
          e.role === 'user'
            ? { id: e.messageId, role: 'user', content: '' }
            : { id: e.messageId, role: 'assistant', content: '' },
        );
        break;
      }
      case EventType.TEXT_MESSAGE_CONTENT: {
        const e = event as TextMessageContentEvent;
        const i = messages.findIndex((m) => m.id === e.messageId);
        if (i === -1) break;
        const m = messages[i]!;
        if (m.role === 'user' || m.role === 'assistant') {
          const prev = typeof m.content === 'string' ? m.content : '';
          messages[i] = { ...m, content: prev + e.delta } as Message;
        }
        break;
      }
      case EventType.REASONING_MESSAGE_START: {
        const e = event as ReasoningMessageStartEvent;
        if (messages.some((m) => m.id === e.messageId)) break;
        messages.push({
          id: e.messageId,
          role: 'reasoning',
          content: '',
        });
        break;
      }
      case EventType.REASONING_MESSAGE_CONTENT: {
        const e = event as ReasoningMessageContentEvent;
        const i = messages.findIndex((m) => m.id === e.messageId);
        const m = messages[i];
        if (!m || m.role !== 'reasoning') break;
        messages[i] = { ...m, content: m.content + e.delta };
        break;
      }
      case EventType.TOOL_CALL_START: {
        const e = event as ToolCallStartEvent;
        const parent = upsertAssistant(
          messages,
          e.parentMessageId ?? `tc-${e.toolCallId}`,
        );
        const i = messages.indexOf(parent);
        messages[i] = {
          ...parent,
          toolCalls: [
            ...(parent.toolCalls ?? []),
            {
              id: e.toolCallId,
              type: 'function',
              function: { name: e.toolCallName, arguments: '' },
            },
          ],
        };
        break;
      }
      case EventType.TOOL_CALL_ARGS: {
        const e = event as ToolCallArgsEvent;
        const i = messages.findIndex(
          (m) =>
            m.role === 'assistant' &&
            m.toolCalls?.some((c) => c.id === e.toolCallId),
        );
        if (i === -1) break;
        const m = messages[i] as Assistant;
        messages[i] = {
          ...m,
          toolCalls: m.toolCalls!.map((c) =>
            c.id === e.toolCallId
              ? {
                  ...c,
                  function: {
                    ...c.function,
                    arguments: c.function.arguments + e.delta,
                  },
                }
              : c,
          ),
        };
        break;
      }
      case EventType.TOOL_CALL_RESULT: {
        const e = event as ToolCallResultEvent;
        if (messages.some((m) => m.id === e.messageId)) break;
        messages.push({
          id: e.messageId,
          role: 'tool',
          toolCallId: e.toolCallId,
          content: e.content,
          ...(e.metadata?.error ? { error: String(e.content) } : {}),
        });
        break;
      }
      default:
        break;
    }
  }
  return messages;
}

/** The latest value of each CUSTOM event name in a batch. */
export function latestCustom(
  events: BaseEvent[],
): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const e of events) {
    if (e.type === EventType.CUSTOM) {
      const c = e as CustomEvent;
      out.set(c.name, c.value);
    }
  }
  return out;
}
