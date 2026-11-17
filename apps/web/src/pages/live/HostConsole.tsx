import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, limit, orderBy, updateDoc, where } from "firebase/firestore";
import { SheetStyles } from "@bingo/sheet";
import type { Claim, Player, Session } from "@bingo/core";
import { db } from "../../lib/firebase";
import { liveRound } from "../../lib/callables";
import { useAuth, useCollection, useDoc } from "../../lib/hooks";
import { Alert, Badge, Button, Card, Dialog, FullPageSpinner, cn } from "../../components/ui";
import { useGameContent } from "../../components/live/content";
import { JoinQR, joinUrl } from "../../components/live/JoinQR";
import { useAction } from "../../components/live/useAction";
import { formatDuration } from "../../components/live/liveUtils";
import { DrawPanel, DrawnList } from "./DrawPanel";
import { ClaimsPanel } from "./ClaimsPanel";
import { PlayersPanel } from "./PlayersPanel";
import { RoundSettings } from "./RoundSettings";

const PING_MS = 4 * 60 * 1000;

export type PlayerDoc = Player & { id: string };
export type ClaimDoc = Claim & { id: string };
export type SessionDoc = Session & { id: string };

export default function HostConsole() {
  const { gameId = "", sessionId = "" } = useParams();
  const { user, loading: authLoading } = useAuth();
  const signedIn = !!user && !user.isAnonymous;
  const sessionPath = `games/${gameId}/sessions/${sessionId}`;
  const content = useGameContent(gameId, signedIn);
  const isOwner = !!user && content.game.data?.ownerId === user.uid;
  const session = useDoc<Session>(isOwner ? sessionPath : null);
  const players = useCollection<Player>(isOwner ? `${sessionPath}/players` : null, [orderBy("joinedAt")], "byJoin");
  const claims = useCollection<Claim>(isOwner ? `${sessionPath}/claims` : null, [orderBy("createdAt", "desc"), limit(40)], "recent");
  const pending = useCollection<Claim>(isOwner ? `${sessionPath}/claims` : null, [where("status", "==", "pending")], "pending");
  const s = session.data;

  // Warm the liveRound function: once on open and every few minutes while the round runs.
  const running = !!s && s.status !== "ended";
  useEffect(() => {
    if (!isOwner) return;
    const ping = () => void liveRound({ action: "ping" }).catch(() => undefined);
    ping();
    if (!running) return;
    const t = setInterval(ping, PING_MS);
    return () => clearInterval(t);
  }, [isOwner, running]);

  if (authLoading || (signedIn && content.game.loading) || (isOwner && session.loading)) return <FullPageSpinner />;
  if (!signedIn)
    return (
      <Centered>
        <p className="mb-4">Sign in as the host to open the round console.</p>
        <Link className="text-indigo-700 underline" to="/">Go to sign in</Link>
      </Centered>
    );
  if (!content.game.data || !isOwner) return <Centered>Only the game's host can open this console.</Centered>;
  if (!s) return <Centered>This round does not exist.</Centered>;

  return (
    <div className="min-h-screen bg-slate-100">
      <SheetStyles />
      <ConsoleTopBar gameId={gameId} sessionId={sessionId} session={s as SessionDoc} title={content.game.data.title} slotLabel={content.game.data.printLayout.slotLabels[s.sheetSlot] ?? `Game ${s.sheetSlot + 1}`} playerCount={players.data.length} />
      {s.status === "ended" ? (
        <EndedSummary gameId={gameId} sessionId={sessionId} session={s as SessionDoc} />
      ) : (
        <main className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="space-y-4">
            {s.mode === "central" ? (
              <DrawPanel gameId={gameId} sessionId={sessionId} session={s as SessionDoc} resolve={content.resolve} />
            ) : (
              <Card>
                <h2 className="mb-1 text-lg font-bold">Self-marking round</h2>
                <p className="text-sm text-slate-600">Players mark their own boards. There are no draws or claim checks in this mode.</p>
              </Card>
            )}
            {s.mode === "central" && <DrawnList session={s as SessionDoc} resolve={content.resolve} />}
          </div>
          <div className="space-y-4">
            {s.mode === "central" && (
              <ClaimsPanel
                gameId={gameId}
                sessionId={sessionId}
                session={s as SessionDoc}
                grid={{ rows: content.game.data.settings.rows, cols: content.game.data.settings.cols }}
                resolve={content.resolve}
                pending={pending.data as ClaimDoc[]}
                recent={(claims.data as ClaimDoc[]).filter((c) => c.status !== "pending")}
              />
            )}
            <WinnersCard session={s as SessionDoc} />
          </div>
          <div className="space-y-4">
            <PlayersPanel gameId={gameId} sessionId={sessionId} session={s as SessionDoc} players={players.data as PlayerDoc[]} />
            <RoundSettings sessionPath={sessionPath} session={s as SessionDoc} />
          </div>
        </main>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center text-slate-700">{children}</div>;
}

const STATUS_STYLE: Record<Session["status"], string> = {
  lobby: "bg-sky-100 text-sky-800",
  live: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  ended: "bg-slate-200 text-slate-700",
};

function ConsoleTopBar({ gameId, sessionId, session: s, title, slotLabel, playerCount }: { gameId: string; sessionId: string; session: SessionDoc; title: string; slotLabel: string; playerCount: number }) {
  const { busy, error, setError, run } = useAction();
  const [showQr, setShowQr] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [copied, setCopied] = useState(false);
  const sessionRef = useMemo(() => doc(db, `games/${gameId}/sessions/${sessionId}`), [gameId, sessionId]);
  const ids = { gameId, sessionId };

  const setStatus = (status: "live" | "paused") =>
    run("status", async () => {
      await updateDoc(sessionRef, { status });
      // Reschedule auto-draw from now so resuming doesn't fire an overdue draw at once.
      if (status === "live" && s.mode === "central" && s.autoDraw.enabled) {
        await liveRound({ action: "setAutoDraw", ...ids, enabled: true, intervalSec: s.autoDraw.intervalSec });
      }
    });

  const copyDisplayLink = () =>
    run("display", async () => {
      const { displayToken } = await liveRound({ action: "createDisplayLink", ...ids });
      const url = `${location.origin}/display/${displayToken}`;
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        window.prompt("Copy this one-time display link:", url);
      }
    });

  const endRound = () =>
    run("end", async () => {
      await liveRound({ action: "endRound", ...ids });
      setConfirmEnd(false);
    });

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">
        <div className="min-w-0">
          <Link to={`/games/${gameId}?tab=rounds`} className="text-xs text-slate-500 hover:underline">← Game</Link>
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-bold" dir="auto">{title}</h1>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase", STATUS_STYLE[s.status])}>{s.status}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs text-slate-600">
            <Badge dir="auto">{slotLabel}</Badge>
            <Badge>{s.medium}</Badge>
            <Badge>{s.mode === "central" ? "central draw" : "self-marking"}</Badge>
          </div>
        </div>
        {s.joinCode && s.status !== "ended" && (
          <button onClick={() => setShowQr(true)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 hover:bg-slate-50" title="Show join QR">
            <JoinQR text={joinUrl(s.joinCode)} className="size-11" />
            <span className="text-start">
              <span className="block text-[10px] uppercase tracking-wide text-slate-500">Join code</span>
              <span className="font-mono text-2xl font-bold tracking-[0.2em]">{s.joinCode}</span>
            </span>
          </button>
        )}
        <Stat label="Players" value={playerCount} />
        {s.mode === "central" && <Stat label="Draws" value={`${s.draws.length} / ${s.totalItems ?? "?"}`} />}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <a href={`/present/${gameId}/${sessionId}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-100">Open projector ↗</a>
          {s.status !== "ended" && (
            <Button size="sm" variant="outline" onClick={copyDisplayLink} disabled={busy === "display"}>
              {copied ? "Link copied ✓" : "Copy display link"}
            </Button>
          )}
          {s.status === "lobby" && <Button size="sm" onClick={() => setStatus("live")} disabled={busy === "status"}>Go live</Button>}
          {s.status === "live" && <Button size="sm" variant="secondary" onClick={() => setStatus("paused")} disabled={busy === "status"}>Pause</Button>}
          {s.status === "paused" && <Button size="sm" onClick={() => setStatus("live")} disabled={busy === "status"}>Resume</Button>}
          {s.status !== "ended" && <Button size="sm" variant="destructive" onClick={() => setConfirmEnd(true)}>End round</Button>}
        </div>
      </div>
      {error && (
        <div className="mx-auto max-w-[1600px] px-4 pb-2">
          <Alert kind="error">
            {error} <button className="ms-2 underline" onClick={() => setError(null)}>Dismiss</button>
          </Alert>
        </div>
      )}
      {showQr && s.joinCode && (
        <Dialog title="Join this round" onClose={() => setShowQr(false)}>
          <JoinQR text={joinUrl(s.joinCode)} className="mx-auto aspect-square w-72" />
          <p className="mt-3 text-center font-mono text-4xl font-bold tracking-[0.25em]">{s.joinCode}</p>
          <p className="mt-1 text-center text-sm text-slate-600">{joinUrl(s.joinCode)}</p>
          <div className="mt-4 flex justify-end"><Button variant="outline" onClick={() => setShowQr(false)}>Close</Button></div>
        </Dialog>
      )}
      {confirmEnd && (
        <Dialog title="End this round?" onClose={() => setConfirmEnd(false)}>
          <p className="mb-4 text-slate-700">The join code closes, players see the final results, and round details are deleted after 30 days. This can't be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmEnd(false)}>Cancel</Button>
            <Button variant="destructive" onClick={endRound} disabled={busy === "end"}>End round</Button>
          </div>
        </Dialog>
      )}
    </header>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function WinnersCard({ session: s }: { session: SessionDoc }) {
  return (
    <Card>
      <h2 className="mb-2 text-lg font-bold">Winners</h2>
      {s.winners.length === 0 ? (
        <p className="text-sm text-slate-500">No winners yet.</p>
      ) : (
        <ol className="space-y-1">
          {s.winners.map((w, i) => (
            <li key={`${w.claimId}-${w.patternId ?? w.pattern}`} className="flex items-baseline gap-2">
              <span className="w-6 text-sm text-slate-400">{i + 1}.</span>
              <span className="font-semibold" dir="auto">{w.name}</span>
              <span className="text-sm text-slate-600">№ {w.serial}</span>
              <span className="text-sm text-slate-600" dir="auto">· {w.pattern}</span>
              <span className="ms-auto text-xs text-slate-400">{new Date(w.at).toLocaleTimeString()}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function EndedSummary({ gameId, sessionId, session: s }: { gameId: string; sessionId: string; session: SessionDoc }) {
  const durationSec = s.summary?.durationSec ?? (s.endedAt && (s.startedAt ?? s.createdAt) ? (s.endedAt - (s.startedAt ?? s.createdAt)!) / 1000 : 0);
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <Card>
        <h2 className="mb-3 text-2xl font-bold">Round ended</h2>
        <div className="flex flex-wrap gap-8">
          <Stat label="Draws" value={s.summary?.drawCount ?? s.draws.length} />
          <Stat label="Players" value={s.summary?.playerCount ?? "—"} />
          <Stat label="Duration" value={formatDuration(durationSec)} />
          <Stat label="Winners" value={s.winners.length} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={`/games/${gameId}?tab=rounds`} className="inline-flex h-10 items-center rounded-lg bg-indigo-600 px-4 font-medium text-white hover:bg-indigo-700">Back to the game</Link>
          <a href={`/present/${gameId}/${sessionId}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 font-medium hover:bg-slate-100">Projector ↗</a>
        </div>
      </Card>
      <WinnersCard session={s} />
    </main>
  );
}
