// Per-pane session streams: the Claude Code transcript as AG-UI events,
// plus the agent's current interactive prompt.

import {
  applyEvents,
  EventType,
  type BaseEvent,
  type Message,
} from '@devhub/shared/agui';
import {
  CUSTOM_EVENTS,
  type AgentPane,
  type HubSnapshot,
  type PromptInfo,
} from '@devhub/shared/hub';
import { askSummary, parsePrompt } from './claude/prompt.ts';
import { locateTranscript, Tailer } from './claude/transcript.ts';
import { TranscriptTranslator } from './claude/translate.ts';
import { herdr } from './herdr/client.ts';
import type { Collector } from './hub/collector.ts';

const SNAPSHOT_MESSAGES = 600;
const PROMPT_POLL_MS = 700;

type Listener = (events: BaseEvent[]) => void;

const findAgent = (hub: HubSnapshot | null, paneId: string) =>
  hub?.workspaces
    .flatMap((ws) => ws.panes)
    .find(
      (p): p is AgentPane =>
        p.kind === 'agent' && p.paneId === paneId,
    );

// ---- prompts ---------------------------------------------------------

/** Polls the screen of every blocked agent and keeps its parsed menu. */
export class PromptWatcher {
  private prompts = new Map<string, PromptInfo>();
  private listeners = new Set<
    (paneId: string, prompt: PromptInfo | null) => void
  >();
  private timer: ReturnType<typeof setInterval>;
  private polling = false;

  constructor(private readonly collector: Collector) {
    this.timer = setInterval(() => void this.poll(), PROMPT_POLL_MS);
  }

  get(paneId: string) {
    return this.prompts.get(paneId) ?? null;
  }

  onChange(l: (paneId: string, prompt: PromptInfo | null) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private set(paneId: string, prompt: PromptInfo | null) {
    const prev = this.prompts.get(paneId);
    if ((prev?.hash ?? null) === (prompt?.hash ?? null)) return;
    if (prompt) this.prompts.set(paneId, prompt);
    else this.prompts.delete(paneId);
    this.collector.setAsk(paneId, prompt ? askSummary(prompt) : null);
    for (const l of this.listeners) l(paneId, prompt);
  }

  /** Read one pane's screen now (used right before answering). */
  async readNow(paneId: string): Promise<PromptInfo | null> {
    const prompt = parsePrompt(await herdr.readVisible(paneId));
    this.set(paneId, prompt);
    return prompt;
  }

  private async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const hub = this.collector.current();
      const blocked = new Set(
        hub?.workspaces
          .flatMap((ws) => ws.panes)
          .filter(
            (p) => p.kind === 'agent' && p.status === 'needsYou',
          )
          .map((p) => p.paneId) ?? [],
      );
      for (const paneId of this.prompts.keys()) {
        if (!blocked.has(paneId)) this.set(paneId, null);
      }
      await Promise.all(
        [...blocked].map((paneId) =>
          this.readNow(paneId).catch(() => null),
        ),
      );
    } finally {
      this.polling = false;
    }
  }

  stop() {
    clearInterval(this.timer);
  }
}

// ---- transcripts -----------------------------------------------------

class SessionStream {
  private listeners = new Set<Listener>();
  private messages: Message[] = [];
  private translator = new TranscriptTranslator();
  private tailer: Tailer | null = null;
  private sessionId: string | null = null;
  private starting: Promise<void> | null = null;

  constructor(
    private readonly paneId: string,
    private readonly collector: Collector,
    private readonly prompts: PromptWatcher,
  ) {}

  get size() {
    return this.listeners.size;
  }

  add(listener: Listener) {
    this.listeners.add(listener);
    const send = () => listener(this.initialEvents());
    if (this.starting) void this.starting.then(send);
    else send();
  }

  remove(listener: Listener) {
    this.listeners.delete(listener);
  }

  private initialEvents(): BaseEvent[] {
    return [
      {
        type: EventType.MESSAGES_SNAPSHOT,
        messages: this.messages.slice(-SNAPSHOT_MESSAGES),
      } as BaseEvent,
      this.custom(CUSTOM_EVENTS.meta, this.translator.meta),
      this.custom(
        CUSTOM_EVENTS.prompt,
        this.prompts.get(this.paneId),
      ),
    ];
  }

  private custom(name: string, value: unknown): BaseEvent {
    return { type: EventType.CUSTOM, name, value } as BaseEvent;
  }

  emit(events: BaseEvent[]) {
    if (!events.length) return;
    for (const l of this.listeners) l(events);
  }

  /** Follow the pane's current Claude session, restarting when it
   * changes (e.g. after /clear). */
  sync() {
    const pane = findAgent(this.collector.current(), this.paneId);
    const sessionId = pane?.sessionId ?? null;
    if (sessionId === this.sessionId) return;
    this.sessionId = sessionId;
    this.tailer?.stop();
    this.tailer = null;
    this.messages = [];
    this.translator = new TranscriptTranslator();
    if (!sessionId) {
      this.emit(this.initialEvents());
      return;
    }
    this.starting = (async () => {
      const path = await locateTranscript(
        sessionId,
        pane?.cwd ?? null,
      );
      if (!path || sessionId !== this.sessionId) return;
      let initial = true;
      const tailer = new Tailer(
        path,
        (entries) => {
          const events = entries.flatMap((e) =>
            this.translator.translate(e as never),
          );
          this.messages = applyEvents(this.messages, events);
          if (!initial) {
            this.emit([
              ...events,
              this.custom(CUSTOM_EVENTS.meta, this.translator.meta),
            ]);
          }
        },
        () => {
          this.messages = [];
          this.translator = new TranscriptTranslator();
          this.emit(this.initialEvents());
        },
      );
      this.tailer = tailer;
      await tailer.start();
      initial = false;
    })().finally(() => {
      this.starting = null;
    });
    void this.starting.then(() => this.emit(this.initialEvents()));
  }

  stop() {
    this.tailer?.stop();
  }
}

export class Sessions {
  private streams = new Map<string, SessionStream>();

  constructor(
    private readonly collector: Collector,
    private readonly prompts: PromptWatcher,
  ) {
    collector.onChange(() => {
      for (const s of this.streams.values()) s.sync();
    });
    prompts.onChange((paneId, prompt) => {
      this.streams.get(paneId)?.emit([
        {
          type: EventType.CUSTOM,
          name: CUSTOM_EVENTS.prompt,
          value: prompt,
        } as BaseEvent,
      ]);
    });
  }

  subscribe(paneId: string, listener: Listener) {
    let stream = this.streams.get(paneId);
    if (!stream) {
      stream = new SessionStream(
        paneId,
        this.collector,
        this.prompts,
      );
      this.streams.set(paneId, stream);
      stream.sync();
    }
    stream.add(listener);
  }

  unsubscribe(paneId: string, listener: Listener) {
    const stream = this.streams.get(paneId);
    if (!stream) return;
    stream.remove(listener);
    if (stream.size === 0) {
      stream.stop();
      this.streams.delete(paneId);
    }
  }
}
