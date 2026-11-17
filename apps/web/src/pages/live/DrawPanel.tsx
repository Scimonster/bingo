import { useEffect, useRef, useState } from "react";
import type { Resolve } from "@bingo/sheet";
import { LIMITS } from "@bingo/core";
import { liveRound } from "../../lib/callables";
import { useNow } from "../../lib/hooks";
import { Alert, Button, Card, Input, cn } from "../../components/ui";
import { ItemTile } from "../../components/live/content";
import { autoDrawBlocker, isAutoDrawDue, secondsUntil, type AutoDrawSession } from "../../components/live/liveUtils";
import { useAction } from "../../components/live/useAction";
import type { SessionDoc } from "./HostConsole";

const BLOCKER_TEXT = {
  notLive: "Paused — auto-draw runs only while the round is live.",
  empty: "The bag is empty.",
  claims: "Paused while a claim waits for your decision.",
} as const;

export function DrawPanel({ gameId, sessionId, session: s, resolve }: { gameId: string; sessionId: string; session: SessionDoc; resolve: Resolve }) {
  const { busy, error, run } = useAction();
  const now = useNow(250);
  const drawCount = s.draws.length;
  const last = s.draws[drawCount - 1];
  const bagEmpty = s.totalItems != null && drawCount >= s.totalItems;
  const ids = { gameId, sessionId };
  const autoState: AutoDrawSession = { status: s.status, mode: s.mode, autoDraw: s.autoDraw, pendingClaims: s.pendingClaims, totalItems: s.totalItems, drawCount };
  const blocker = autoDrawBlocker(autoState);

  // Auto-draw timer: draw with auto:true once nextDrawAt passes. One request per draw count;
  // a refused or failed request is retried after a short back-off.
  const inflight = useRef<number | null>(null);
  const doneFor = useRef<number | null>(null);
  const retryAt = useRef(0);
  const [autoError, setAutoError] = useState<string | null>(null);
  useEffect(() => {
    if (!isAutoDrawDue(autoState, now)) return;
    if (inflight.current === drawCount || doneFor.current === drawCount || now < retryAt.current) return;
    inflight.current = drawCount;
    liveRound({ action: "draw", ...ids, expectedCount: drawCount, auto: true })
      .then((r) => {
        if (r.drawn) {
          doneFor.current = drawCount;
          setAutoError(null);
        } else retryAt.current = Date.now() + 2000;
      })
      .catch((e: unknown) => {
        retryAt.current = Date.now() + 5000;
        setAutoError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        inflight.current = null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, drawCount, s.status, s.autoDraw.enabled, s.autoDraw.nextDrawAt, s.pendingClaims]);

  const drawNow = () => run("draw", () => liveRound({ action: "draw", ...ids, expectedCount: drawCount }));
  const setAuto = (enabled: boolean, intervalSec: number) => run("auto", () => liveRound({ action: "setAutoDraw", ...ids, enabled, intervalSec }));

  const [interval, setIntervalText] = useState(String(s.autoDraw.intervalSec));
  useEffect(() => setIntervalText(String(s.autoDraw.intervalSec)), [s.autoDraw.intervalSec]);
  const parsedInterval = Math.round(Number(interval));
  const intervalValid = Number.isFinite(parsedInterval) && parsedInterval >= LIMITS.autoDrawMinSec && parsedInterval <= LIMITS.autoDrawMaxSec;
  const applyInterval = () => {
    if (intervalValid && parsedInterval !== s.autoDraw.intervalSec) void setAuto(s.autoDraw.enabled, parsedInterval);
  };
  const countdown = blocker === null ? secondsUntil(s.autoDraw.nextDrawAt, now) : null;
  const canDraw = s.status === "live" && !bagEmpty;

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="w-40 shrink-0 sm:w-52">
          {last ? (
            <ItemTile key={drawCount} itemId={last.itemId} resolve={resolve} className="w-full animate-[pulse_1s_ease-out_1] rounded-xl border-4 border-indigo-500 bg-white" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-xl border-4 border-dashed border-slate-300 text-sm text-slate-400">No draws yet</div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Current item</div>
            <div className="text-3xl font-black tabular-nums">
              #{drawCount} <span className="text-lg font-medium text-slate-500">of {s.totalItems ?? "?"}</span>
            </div>
          </div>
          <Button size="xl" onClick={drawNow} disabled={!canDraw || busy === "draw"} className="w-full">
            {busy === "draw" ? "Drawing…" : bagEmpty ? "Bag empty" : "Draw"}
          </Button>
          {s.status === "lobby" && <p className="text-sm text-slate-600">Go live to start drawing.</p>}
          {s.status === "paused" && <p className="text-sm text-amber-700">The round is paused.</p>}
          {(s.pendingClaims ?? 0) > 0 && <p className="text-sm text-amber-700">A claim is waiting for your decision.</p>}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 font-medium">
            <input type="checkbox" className="size-5 accent-indigo-600" checked={s.autoDraw.enabled} disabled={busy === "auto"} onChange={(e) => setAuto(e.target.checked, intervalValid ? parsedInterval : s.autoDraw.intervalSec)} />
            Auto-draw every
          </label>
          <Input
            type="number"
            min={LIMITS.autoDrawMinSec}
            max={LIMITS.autoDrawMaxSec}
            value={interval}
            onChange={(e) => setIntervalText(e.target.value)}
            onBlur={applyInterval}
            onKeyDown={(e) => e.key === "Enter" && applyInterval()}
            className={cn("w-20", !intervalValid && "border-red-400")}
            aria-label="Auto-draw interval in seconds"
          />
          <span>seconds</span>
          {countdown !== null && (
            <span className="ms-auto rounded-full bg-indigo-50 px-3 py-1 font-mono text-lg font-bold text-indigo-700 tabular-nums">next in {countdown}s</span>
          )}
        </div>
        {s.autoDraw.enabled && blocker && blocker !== "off" && <p className="mt-2 text-sm text-amber-700">{BLOCKER_TEXT[blocker]}</p>}
        <p className="mt-2 text-xs text-slate-500">Auto-draw runs from this console — keep this tab open.</p>
      </div>
      {(error || autoError) && <Alert kind="error">{error ?? `Auto-draw: ${autoError}`}</Alert>}
    </Card>
  );
}

/** Drawn items, newest first, numbered in draw order. */
export function DrawnList({ session: s, resolve }: { session: SessionDoc; resolve: Resolve }) {
  const draws = s.draws;
  return (
    <Card>
      <h2 className="mb-2 text-lg font-bold">Drawn items <span className="text-sm font-normal text-slate-500">({draws.length})</span></h2>
      {draws.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing drawn yet.</p>
      ) : (
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
          {draws
            .map((d, i) => ({ d, n: i + 1 }))
            .reverse()
            .map(({ d, n }) => (
              <li key={`${n}-${d.itemId}`} className={cn("relative rounded-lg border bg-white", n === draws.length ? "border-indigo-500 ring-2 ring-indigo-300" : "border-slate-200")}>
                <span className="absolute -top-2 start-1 z-10 rounded bg-slate-800 px-1 text-[10px] font-bold text-white">{n}</span>
                <ItemTile itemId={d.itemId} resolve={resolve} className="w-full" />
              </li>
            ))}
        </ol>
      )}
    </Card>
  );
}
