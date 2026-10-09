// A command on a real PTY, hosted by a Node sidecar (host.mjs).
//
// Adapted from herdr-web-ui (https://github.com/devswha/herdr-web-ui),
// server/pty/session.ts. Copyright (c) 2026 devswha. MIT License; see
// THIRD_PARTY_NOTICES.md.
//
// node-pty must never load inside Bun (it panics the runtime,
// oven-sh/bun#18546), hence the sidecar.

import { join } from 'node:path';

const HOST_SCRIPT = join(import.meta.dir, 'host.mjs');

export interface PtySessionOptions {
  command: string;
  args: string[];
  cols: number;
  rows: number;
  env?: Record<string, string | undefined>;
  onData: (data: string) => void;
  onExit: (code: number | null) => void;
}

export class PtySession {
  private readonly proc: ReturnType<typeof Bun.spawn>;
  private closed = false;
  private paused = false;

  constructor(private readonly options: PtySessionOptions) {
    this.proc = Bun.spawn(
      [
        'node',
        HOST_SCRIPT,
        String(options.cols),
        String(options.rows),
        options.command,
        ...options.args,
      ],
      {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'inherit',
        env: { ...process.env, ...options.env },
      },
    );
    void Promise.all([this.proc.exited, this.pump()]).then(
      ([code]) => {
        if (this.closed) return;
        this.closed = true;
        options.onExit(code ?? null);
      },
    );
  }

  private async pump() {
    const stream = this.proc.stdout;
    if (!(stream instanceof ReadableStream)) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (text) this.options.onData(text);
      }
      const tail = decoder.decode();
      if (tail) this.options.onData(tail);
    } catch {
      // the pty closed underneath us; onExit reports it
    } finally {
      reader.releaseLock();
    }
  }

  private send(frame: Record<string, unknown>) {
    if (this.closed) return;
    const sink = this.proc.stdin;
    if (!sink || typeof sink === 'number') return;
    try {
      sink.write(`${JSON.stringify(frame)}\n`);
      sink.flush();
    } catch {
      // host already gone
    }
  }

  write(data: string) {
    this.send({ t: 'i', d: data });
  }

  resize(cols: number, rows: number) {
    this.send({ t: 'r', c: cols, r: rows });
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.send({ t: 'p', paused: true });
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.send({ t: 'p', paused: false });
  }

  kill() {
    if (this.closed) return;
    this.closed = true;
    const sink = this.proc.stdin;
    try {
      if (sink && typeof sink !== 'number') sink.end();
    } catch {
      // ignore
    }
    try {
      this.proc.kill();
    } catch {
      // ignore
    }
  }
}
