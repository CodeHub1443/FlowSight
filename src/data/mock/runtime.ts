import type { Unsub } from '../DataSource';
import {
  SimController,
  type Cmd,
  type Evt,
  type InitOptions,
  type ReadyInfo,
} from './core/controller';
import type { ApiRequest, ApiResponse } from './core/api';
import type { SimMessage } from './core/types';

// Main-thread side of the simulator: one SimRuntime owns one host (Web Worker in the browser, the same
// SimController inline under Node/jsdom). MockSource (live channels) and the MSW handlers (REST) both talk to it.

export interface SimHost {
  post(cmd: Cmd): void;
  subscribe(cb: (e: Evt) => void): Unsub;
  terminate(): void;
}

class WorkerHost implements SimHost {
  private readonly worker: Worker;
  private readonly subs = new Set<(e: Evt) => void>();

  constructor() {
    this.worker = new Worker(new URL('./simulator.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<Evt>) => {
      for (const cb of [...this.subs]) cb(e.data);
    };
  }

  post(cmd: Cmd): void {
    this.worker.postMessage(cmd);
  }

  subscribe(cb: (e: Evt) => void): Unsub {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  terminate(): void {
    this.worker.terminate();
  }
}

export interface InlineHostOptions {
  /** Run the real-time loop (default true). Tests set false and call `controller.advance`. */
  autoTick?: boolean;
  now?: () => number;
}

/** Runs the controller on the calling thread (Node tests, jsdom). Events are cloned like a real worker boundary. */
export class InlineHost implements SimHost {
  readonly controller: SimController;
  private readonly subs = new Set<(e: Evt) => void>();

  constructor(opts: InlineHostOptions = {}) {
    this.controller = new SimController(
      (e) => {
        const copy = structuredClone(e);
        for (const cb of [...this.subs]) cb(copy);
      },
      opts.now ? { now: opts.now } : {},
    );
    if (opts.autoTick ?? true) this.controller.start();
  }

  post(cmd: Cmd): void {
    this.controller.handle(cmd);
  }

  subscribe(cb: (e: Evt) => void): Unsub {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  terminate(): void {
    this.controller.stop();
  }
}

export const DEFAULT_INIT: InitOptions = { seed: 1, scenario: 'now', speed: 1 };

export type MessageBatch = { items: SimMessage[]; simNow: number };

export class SimRuntime {
  private nextId = 1;
  private readonly pending = new Map<number, (res: ApiResponse) => void>();
  private readonly batchSubs = new Set<(b: MessageBatch) => void>();
  private readonly readySubs = new Set<(i: ReadyInfo) => void>();
  private readonly errorSubs = new Set<(m: string) => void>();
  private ready_: Promise<ReadyInfo> | null = null;
  private resolveReady: ((i: ReadyInfo) => void) | null = null;
  private opts: InitOptions = { ...DEFAULT_INIT };
  info: ReadyInfo | null = null;

  constructor(private readonly host: SimHost) {
    host.subscribe((e) => this.onEvent(e));
  }

  private onEvent(e: Evt): void {
    switch (e.t) {
      case 'ready':
        this.info = e.info;
        this.resolveReady?.(e.info);
        for (const cb of [...this.readySubs]) cb(e.info);
        break;
      case 'msgs':
        for (const cb of [...this.batchSubs]) cb({ items: e.items, simNow: e.simNow });
        break;
      case 'rpc': {
        const cb = this.pending.get(e.id);
        this.pending.delete(e.id);
        cb?.(e.res);
        break;
      }
      case 'error':
        for (const cb of [...this.errorSubs]) cb(e.message);
        console.error('[mock simulator]', e.message);
        break;
    }
  }

  /** Initialise once (idempotent) and resolve when the 7-day history is ready. */
  ensure(init: Partial<InitOptions> = {}): Promise<ReadyInfo> {
    if (!this.ready_) {
      this.opts = { ...this.opts, ...init };
      this.ready_ = new Promise<ReadyInfo>((resolve) => {
        this.resolveReady = resolve;
      });
      this.host.post({ t: 'init', ...this.opts });
    }
    return this.ready_;
  }

  /** Restart with new options (seed, scenario, ...). Regenerates history. */
  restart(init: Partial<InitOptions>): Promise<ReadyInfo> {
    this.opts = { ...this.opts, ...init };
    this.ready_ = new Promise<ReadyInfo>((resolve) => {
      this.resolveReady = resolve;
    });
    this.host.post({ t: 'init', ...this.opts });
    return this.ready_;
  }

  get options(): InitOptions {
    return { ...this.opts };
  }

  send(cmd: Cmd): void {
    if (cmd.t === 'speed') this.opts = { ...this.opts, speed: cmd.speed };
    this.host.post(cmd);
  }

  /** Ask the simulator for the full current picture (snapshot + open alerts). */
  connect(): void {
    this.host.post({ t: 'connect' });
  }

  async request(req: ApiRequest): Promise<ApiResponse> {
    await this.ensure();
    const id = this.nextId++;
    return new Promise<ApiResponse>((resolve) => {
      this.pending.set(id, resolve);
      this.host.post({ t: 'rpc', id, req });
    });
  }

  onBatch(cb: (b: MessageBatch) => void): Unsub {
    this.batchSubs.add(cb);
    return () => {
      this.batchSubs.delete(cb);
    };
  }

  onReady(cb: (i: ReadyInfo) => void): Unsub {
    this.readySubs.add(cb);
    return () => {
      this.readySubs.delete(cb);
    };
  }

  onError(cb: (m: string) => void): Unsub {
    this.errorSubs.add(cb);
    return () => {
      this.errorSubs.delete(cb);
    };
  }

  dispose(): void {
    this.host.terminate();
  }
}

let shared: SimRuntime | null = null;

/** The page-wide runtime: a Web Worker where available, inline otherwise. */
export function getSimRuntime(): SimRuntime {
  if (!shared)
    shared = new SimRuntime(typeof Worker === 'undefined' ? new InlineHost() : new WorkerHost());
  return shared;
}

/** Tests: install (or clear) the shared runtime. */
export function setSimRuntime(runtime: SimRuntime | null): void {
  shared?.dispose();
  shared = runtime;
}
