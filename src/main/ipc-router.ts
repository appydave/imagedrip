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
export class IpcRouter {
  private channels: string[] = [];

  register<In, Out>(def: HandlerDef<In, Out>): this {
    this.channels.push(def.channel);
    ipcMain.handle(def.channel, async (_event, raw: unknown) => {
      const input = (def.input ? def.input.parse(raw) : raw) as In;
      return def.handle(input);
    });
    return this;
  }

  /** Remove all registered handlers (called on lifecycle stop). */
  dispose(): void {
    for (const channel of this.channels) ipcMain.removeHandler(channel);
    this.channels = [];
  }
}
