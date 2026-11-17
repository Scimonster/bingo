import { useMemo, useState } from "react";
import type { Resolve } from "@bingo/sheet";
import type { Grid, LiveRoundResponses } from "@bingo/core";
import { liveRound } from "../../lib/callables";
import { Alert, Badge, Button, Card, Input, cn } from "../../components/ui";
import { WinBoard } from "../../components/live/WinBoard";
import { normalizeSerialInput } from "../../components/live/liveUtils";
import { useAction } from "../../components/live/useAction";
import type { ClaimDoc, SessionDoc } from "./HostConsole";

export function ClaimsPanel({
  gameId, sessionId, session: s, grid, resolve, pending, recent,
}: {
  gameId: string;
  sessionId: string;
  session: SessionDoc;
  grid: Grid;
  resolve: Resolve;
  pending: ClaimDoc[];
  recent: ClaimDoc[];
}) {
  const { busy, error, run } = useAction();
  const drawnIds = useMemo(() => s.draws.map((d) => d.itemId), [s.draws]);
  const ids = { gameId, sessionId };
  const decide = (claimId: string, accept: boolean) => run(`decide:${claimId}`, () => liveRound({ action: "decideClaim", ...ids, claimId, accept }));
  const sortedPending = [...pending].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold">Claims</h2>
        {pending.length > 0 && <Badge className="bg-amber-100 text-amber-900">{pending.length} pending</Badge>}
        <Badge className="ms-auto">{s.verification === "host" ? "You confirm claims" : "Auto-verified"}</Badge>
      </div>

      {sortedPending.map((c) => (
        <div key={c.id} className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
            <span className="text-lg font-bold" dir="auto">{c.playerName}</span>
            <span className="font-mono">№ {c.serial}</span>
            <span className="text-sm text-slate-600">at draw {c.drawCount}</span>
            <span className={cn("ms-auto text-sm font-semibold", c.computedValid ? "text-emerald-700" : "text-red-700")}>
              {c.computedValid ? `Checker: valid${c.matchedPattern ? ` (${c.matchedPattern})` : ""}` : "Checker: not a win"}
            </span>
          </div>
          <WinBoard
            gameId={gameId}
            serial={c.serial}
            slot={s.sheetSlot}
            grid={grid}
            drawnIds={drawnIds}
            patterns={s.patterns}
            patternIds={c.matchedPatternIds}
            resolve={resolve}
            label={`Sheet ${c.serial}`}
            className="mx-auto max-w-sm"
          />
          <div className="mt-3 flex gap-2">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => decide(c.id, true)} disabled={busy === `decide:${c.id}`}>Accept</Button>
            <Button className="flex-1" variant="destructive" onClick={() => decide(c.id, false)} disabled={busy === `decide:${c.id}`}>Reject</Button>
          </div>
        </div>
      ))}
      {pending.length === 0 && <p className="text-sm text-slate-500">No claims waiting.</p>}

      <PaperCheck gameId={gameId} sessionId={sessionId} disabled={s.status === "ended"} />
      {error && <Alert kind="error">{error}</Alert>}

      {recent.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-slate-600">Recent decisions</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {recent.slice(0, 12).map((c) => (
              <li key={c.id} className="flex items-baseline gap-2 py-1">
                <span className={cn("w-16 font-semibold", c.status === "valid" ? "text-emerald-700" : "text-red-700")}>{c.status === "valid" ? "Valid" : "Invalid"}</span>
                <span className="truncate" dir="auto">{c.playerName}</span>
                <span className="font-mono text-slate-600">№ {c.serial}</span>
                {c.matchedPattern && <span className="truncate text-slate-500" dir="auto">{c.matchedPattern}</span>}
                {c.byHost && <span className="text-xs text-slate-400">paper</span>}
                <span className="ms-auto text-xs text-slate-400">{new Date(c.decidedAt ?? c.createdAt).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** Host types the serial of a paper sheet held up by a player; the claim is decided immediately. */
function PaperCheck({ gameId, sessionId, disabled }: { gameId: string; sessionId: string; disabled: boolean }) {
  const { busy, error, run } = useAction();
  const [text, setText] = useState("");
  const [result, setResult] = useState<(LiveRoundResponses["submitClaim"] & { serial: string }) | null>(null);
  const serial = normalizeSerialInput(text);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serial) return;
    setResult(null);
    const r = await run("check", () => liveRound({ action: "submitClaim", gameId, sessionId, serial }));
    if (r) {
      setResult({ ...r, serial });
      setText("");
    }
  };
  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 p-3">
      <label htmlFor="paper-serial" className="mb-1 block text-sm font-semibold">Check a paper sheet</label>
      <div className="flex gap-2">
        <Input id="paper-serial" inputMode="numeric" placeholder="Sheet number, e.g. 042" value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} />
        <Button type="submit" disabled={!serial || disabled || busy === "check"}>{busy === "check" ? "Checking…" : "Check"}</Button>
      </div>
      {result && (
        <Alert kind={result.status === "valid" ? "success" : result.status === "pending" ? "warn" : "error"} className="mt-2">
          Sheet № {result.serial}: {result.status === "valid" ? `Bingo! ${result.matchedPattern ?? ""}` : result.status === "pending" ? "pending your decision" : "not a bingo"}
        </Alert>
      )}
      {error && <Alert kind="error" className="mt-2">{error}</Alert>}
    </form>
  );
}
