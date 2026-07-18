import { useEffect } from 'react';
import { useAppStore } from './store';

export default function App(): JSX.Element {
  const { info, pong, count, loadInfo, sendPing, loadCount, increment } = useAppStore();

  useEffect(() => {
    void loadInfo();
    void loadCount();
  }, [loadInfo, loadCount]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">AppyTron</h1>
          <p className="text-sm text-neutral-400">
            Native desktop scaffold · built on <span className="font-mono">@appydave/core</span>
          </p>
        </header>

        <section className="space-y-1 rounded-lg border border-neutral-800 p-4 text-sm">
          <h2 className="mb-2 font-medium">App info · main → IPC → renderer</h2>
          {info ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-neutral-300">
              <dt className="text-neutral-500">name</dt>
              <dd>{info.name}</dd>
              <dt className="text-neutral-500">version</dt>
              <dd>{info.version}</dd>
              <dt className="text-neutral-500">electron</dt>
              <dd>{info.electron}</dd>
              <dt className="text-neutral-500">node</dt>
              <dd>{info.node}</dd>
              <dt className="text-neutral-500">platform</dt>
              <dd>{info.platform}</dd>
            </dl>
          ) : (
            <p className="text-neutral-500">loading…</p>
          )}
        </section>

        <section className="space-y-3 rounded-lg border border-neutral-800 p-4">
          <h2 className="text-sm font-medium">Typed IPC round-trip</h2>
          <button
            type="button"
            onClick={() => void sendPing('hello from renderer')}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500"
          >
            Send ping
          </button>
          {pong && <p className="font-mono text-sm text-emerald-400">{pong}</p>}
        </section>

        <section className="space-y-3 rounded-lg border border-neutral-800 p-4">
          <h2 className="text-sm font-medium">
            Persistent counter · <span className="text-neutral-500">@appydave/core Store</span>
          </h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void increment()}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500"
            >
              Increment
            </button>
            <span className="font-mono text-lg">{count ?? '…'}</span>
          </div>
          <p className="text-xs text-neutral-500">Survives a restart — written to disk via Store.</p>
        </section>
      </div>
    </div>
  );
}
