import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { orderBy } from "firebase/firestore";
import type { Session } from "@bingo/core";
import { Alert, Badge, Button, Card, Spinner, cn } from "../../components/ui";
import { ConfirmDialog, EmptyState } from "../../components/setup/common";
import { formatDuration, toMillis } from "../../components/setup/helpers";
import { useCollection } from "../../lib/hooks";
import { deleteRound } from "../../lib/callables";
import { StartRoundDialog } from "./StartRoundDialog";
import type { TabProps } from "./types";

type SessionDoc = Session & { id: string };

const STATUS: Record<Session["status"], { label: string; cls: string }> = {
  lobby: { label: "Lobby", cls: "bg-sky-100 text-sky-800" },
  live: { label: "Live", cls: "bg-emerald-100 text-emerald-800" },
  paused: { label: "Paused", cls: "bg-amber-100 text-amber-800" },
  ended: { label: "Ended", cls: "bg-slate-200 text-slate-700" },
};

/** First slot with no round yet; otherwise the slot after the most recent round. */
export function nextSlot(sessions: { sheetSlot: number }[], boardsPerSheet: number): number {
  const played = new Set(sessions.map((s) => s.sheetSlot));
  for (let i = 0; i < boardsPerSheet; i++) if (!played.has(i)) return i;
  const last = sessions[0]?.sheetSlot ?? -1; // sessions are newest first
  return (last + 1) % boardsPerSheet;
}

export function RoundsTab({ gameId, game }: TabProps) {
  const sessions = useCollection<Session>(`games/${gameId}/sessions`, [orderBy("createdAt", "desc")], gameId);
  const [starting, setStarting] = useState(false);
  const [toDelete, setToDelete] = useState<SessionDoc | null>(null);
  const hasSheets = !!game.contentLocked;
  const playedSlots = useMemo(() => new Set(sessions.data.map((s) => s.sheetSlot)), [sessions.data]);
  const slotLabel = (i: number) => game.printLayout.slotLabels[i] || `Slot ${i + 1}`;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Rounds</h2>
          <p className="text-sm text-slate-600">{hasSheets ? "Each round plays one board slot of the sheets. Next up: " : "Generate sheets on the Sheets tab before starting a round."}{hasSheets && <strong dir="auto">{slotLabel(nextSlot(sessions.data, game.settings.boardsPerSheet))}</strong>}</p>
        </div>
        <Button size="lg" onClick={() => setStarting(true)} disabled={!hasSheets || sessions.loading} title={hasSheets ? undefined : "No sheets yet"}>
          Start round
        </Button>
      </Card>
      {sessions.error && <Alert kind="error">Could not load rounds: {sessions.error.message}</Alert>}
      {sessions.loading ? (
        <div className="flex justify-center p-6 text-indigo-600">
          <Spinner className="size-8" />
        </div>
      ) : sessions.data.length === 0 ? (
        <EmptyState title="No rounds yet" />
      ) : (
        <ul className="space-y-2">
          {sessions.data.map((s) => {
            const created = toMillis(s.createdAt);
            const st = STATUS[s.status] ?? STATUS.ended;
            const active = s.status !== "ended";
            return (
              <li key={s.id}>
                <Card className={cn("flex flex-wrap items-start gap-3", active && "border-indigo-300")}>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={st.cls}>{st.label}</Badge>
                      <span dir="auto" className="font-semibold">
                        {slotLabel(s.sheetSlot)}
                      </span>
                      <span className="text-sm text-slate-500">
                        {s.medium === "paper" ? "Paper" : "Digital"} · {s.mode === "central" ? "Central" : "Self"}
                      </span>
                      {active && s.joinCode && <Badge className="font-mono">Code {s.joinCode}</Badge>}
                    </div>
                    <p className="text-sm text-slate-600">
                      {created && new Date(created).toLocaleString()}
                      {s.summary
                        ? ` · ${s.summary.drawCount} draws · ${s.summary.playerCount} players · ${formatDuration(s.summary.durationSec)}`
                        : ` · ${s.draws?.length ?? 0} draws so far`}
                    </p>
                    {s.winners?.length > 0 && (
                      <p className="text-sm">
                        Winners:{" "}
                        {s.winners.map((w, i) => (
                          <span key={`${w.claimId}-${i}`}>
                            {i > 0 && ", "}
                            <span dir="auto" className="font-medium">
                              {w.name}
                            </span>{" "}
                            <span className="text-slate-500">
                              (№ {w.serial}, <span dir="auto">{w.pattern}</span>)
                            </span>
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/games/${gameId}/rounds/${s.id}`} className={cn("inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium", active ? "bg-indigo-600 text-white hover:bg-indigo-700" : "border border-slate-300 bg-white hover:bg-slate-100")}>
                      {active ? "Open console" : "View"}
                    </Link>
                    {!active && (
                      <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setToDelete(s)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {starting && <StartRoundDialog gameId={gameId} game={game} defaultSlot={nextSlot(sessions.data, game.settings.boardsPerSheet)} playedSlots={playedSlots} onClose={() => setStarting(false)} />}
      {toDelete && (
        <ConfirmDialog title="Delete this round?" confirmLabel="Delete" onClose={() => setToDelete(null)} onConfirm={() => deleteRound(gameId, toDelete.id)}>
          The round's summary and winners list will be deleted. Sheets are not affected.
        </ConfirmDialog>
      )}
    </div>
  );
}
