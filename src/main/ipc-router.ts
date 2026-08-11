import { ipcMain } from 'electron';
import { z } from '@appydave/core';

export interface HandlerDef<In, Out> {
  /** Channel name (from `@shared/ipc`'s `IPC` map). */
  channel: string;
  /** Optional Zod schema — the payload is validated before `handle` runs. */
  input?: z.ZodType<In>;
  handle: (input: In) => Promise<Out> | Out;
}

/**
 * IpcRouter — the single, validated door between renderer and main.
 *
 * Every channel is registered here, and every payload is Zod-validated before
 * its handler runs. Renderer input is untrusted (docs §9 — Electron is a
 * lethal-trifecta surface), so validation-at-the-boundary is not optional.
 */
/**
 * Runs between the schema parse and the handler, for EVERY renderer call.
 *
 * This is the seam that stops the human path being a bypass. Before it existed,
 * the engine precondition lived only in the HTTP adapter, so a person clicking
 * `▶ Run theme…` against a signed-out ChatGPT met no check at all — the run
 * started and failed downstream inside `feed`, which pastes into whatever holds
 * focus, which on a signed-out page is the login form.
 *
 * It sits AFTER the parse deliberately, so the documented order is preserved:
 * bad payload first, preconditions second.
 */
export type IpcInterceptor = (channel: string, input: unknown) => Promise<void>;

export class IpcRouter {
  private channels: string[] = [];
  private interceptor: IpcInterceptor | null = null;

  /**
   * Install the authorization seam. Set once, at wiring time, before any
   * handler can be called.
   */
  useInterceptor(interceptor: IpcInterceptor): this {
    this.interceptor = interceptor;
    return this;
  }
  /**
   * What was registered, keyed by channel — the registry the control surface
   * mirrors (v4 §9.2a). Recording the def is the ONLY change to `register()`:
   * the handler wiring, the Zod parse and the call are untouched, so the
   * renderer path carries zero new risk.
   */
  private defs = new Map<string, HandlerDef<unknown, unknown>>();

  register<In, Out>(def: HandlerDef<In, Out>): this {
    this.channels.push(def.channel);
    this.defs.set(def.channel, def as unknown as HandlerDef<unknown, unknown>);
    ipcMain.handle(def.channel, async (_event, raw: unknown) => {
      const input = (def.input ? def.input.parse(raw) : raw) as In;
      await this.interceptor?.(def.channel, input);
      return def.handle(input);
    });
    return this;
  }

  /**
   * Snapshot of the registry for the control surface (v4 WP1).
   *
   * The HTTP mirror validates with the SAME `def.input` schema the renderer is
   * held to and calls the SAME `def.handle` — so every run-state lock inside a
   * handler ("brand is locked while a run is live") applies to an agent for
   * free. One API, two clients; there is no second write path to keep in sync.
   */
  list(): ReadonlyMap<string, HandlerDef<unknown, unknown>> {
    return this.defs;
  }

  /** Remove all registered handlers (called on lifecycle stop). */
  dispose(): void {
    for (const channel of this.channels) ipcMain.removeHandler(channel);
    this.channels = [];
    this.defs.clear();
  }
}
