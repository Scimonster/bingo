import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, where } from "firebase/firestore";
import { SheetStyles, type Resolve } from "@bingo/sheet";
import { FREE, type Board, type Claim, type Game, type Player, type Session, type Winner } from "@bingo/core";
import { db } from "../../lib/firebase";
import { useAuth, useCollection, useDoc, useNow } from "../../lib/hooks";
import { PlayerLanguage, fmt, useT } from "../../lib/i18n";
import { cn } from "../../components/ui";
import { ItemTile, useGameContent, type ItemDoc } from "../../components/live/content";
import { JoinQR, joinUrl } from "../../components/live/JoinQR";
import { SpinReveal } from "../../components/live/SpinReveal";
import { DrawnItemsGrid } from "../../components/live/DrawnItemsGrid";
import { WinBoard } from "../../components/live/WinBoard";
import { patternLabel } from "../../components/live/patterns";
import { autoDrawBlocker, secondsUntil } from "../../components/live/liveUtils";
import { useFullscreen, useWakeLock } from "../../components/live/screen";

/** Item IDs in the round's bag: every item on a board of the round's slot (falls back to all items). */
function useBagItems(gameId: string, slot: number | undefined, items: ItemDoc[]): string[] {
  const boards = useQuery({
    queryKey: ["bagItems", gameId, slot],
    enabled: slot != null,
    staleTime: Infinity,
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, `games/${gameId}/boards`), where("slot", "==", slot)));
      const ids = new Set<string>();
      snap.forEach((d) => (d.data() as Board).cells.forEach((c) => c !== FREE && ids.add(c)));
      return ids;
    },
  });
  return useMemo(() => {
    const order = items.map((i) => i.id);
    if (!boards.data || boards.data.size === 0) return order;
    const inBag = order.filter((id) => boards.data.has(id));
    // Items on boards but missing from the items list (shouldn't happen) still show.
    for (const id of boards.data) if (!inBag.includes(id)) inBag.push(id);
    return inBag;
  }, [boards.data, items]);
}

export default function Projector() {
  const { gameId = "", sessionId = "" } = useParams();
  const { user, loading: authLoading } = useAuth();
  const base = `games/${gameId}/sessions/${sessionId}`;
  const session = useDoc<Session>(user ? base : null);
  const content = useGameContent(gameId, !!user);
  const players = useCollection<Player>(user && session.data ? `${base}/players` : null);
  const game = content.game.data;
  const lang = game?.playerLanguage ?? "he";
  useWakeLock(true);

  let body: React.ReactNode;
  if (authLoading || session.loading || content.loading) body = <Center><span className="inline-block size-16 animate-spin rounded-full border-4 border-yellow-300 border-t-transparent" /></Center>;
  else if (!user || !session.data || !game) body = <NoAccess />;
  else body = <Stage gameId={gameId} sessionId={sessionId} session={session.data} game={game} resolve={content.resolve} items={content.items.data as ItemDoc[]} playerCount={players.data.length} playerNames={players.data.map((p) => p.name)} />;

  return (
    <PlayerLanguage lang={lang}>
      <SheetStyles />
      <div className="relative h-dvh overflow-hidden bg-slate-950 text-white selection:bg-yellow-300">{body}</div>
    </PlayerLanguage>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-6 p-10 text-center">{children}</div>;
}

function NoAccess() {
  const t = useT();
  return (
    <Center>
      <p className="text-4xl font-bold">{t("displayLinkFailed")}</p>
    </Center>
  );
}

function FullscreenButton() {
  const t = useT();
  const fs = useFullscreen();
  if (!fs.supported) return null;
  return (
    <button onClick={fs.toggle} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white">
      {fs.isFullscreen ? t("exitFullscreen") : t("fullscreen")} ⛶
    </button>
  );
}

interface StageProps {
  gameId: string;
  sessionId: string;
  session: Session;
  game: Game & { id: string };
  resolve: Resolve;
  items: ItemDoc[];
  playerCount: number;
  playerNames: string[];
}

function Stage(p: StageProps) {
  const s = p.session;
  const slotLabel = p.game.printLayout.slotLabels[s.sheetSlot] ?? `${s.sheetSlot + 1}`;
  let view: React.ReactNode;
  if (s.status === "ended") view = <EndedView {...p} />;
  else if (s.status === "lobby" || s.mode === "self") view = <LobbyView {...p} />;
  else view = <LiveView {...p} />;
  return (
    <>
      {view}
      <div className="absolute end-3 top-3 z-20 opacity-40 transition-opacity hover:opacity-100">
        <FullscreenButton />
      </div>
      {s.status !== "ended" && s.mode === "central" && (
        <ClaimScreen gameId={p.gameId} sessionId={p.sessionId} session={s} grid={{ rows: p.game.settings.rows, cols: p.game.settings.cols }} resolve={p.resolve} slotLabel={slotLabel} />
      )}
      <WinOverlay gameId={p.gameId} session={s} grid={{ rows: p.game.settings.rows, cols: p.game.settings.cols }} resolve={p.resolve} slotLabel={slotLabel} />
    </>
  );
}

function LobbyView({ session: s, game, playerCount, playerNames }: StageProps) {
  const t = useT();
  const code = s.joinCode;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3vh] p-[3vw] text-center">
      <h1 className="text-[min(6vw,9vh)] leading-tight font-black" dir="auto">{game.title}</h1>
      {code ? (
        <div className="flex items-center gap-[4vw]">
          <div className="rounded-3xl bg-white p-[1.2vh]">
            <JoinQR text={joinUrl(code)} className="size-[min(32vw,42vh)]" />
          </div>
          <div className="flex flex-col items-center gap-[2vh]">
            <div className="text-[min(2.6vw,4vh)] text-white/70">{t("scanToJoin")}</div>
            <div className="text-[min(2.2vw,3.4vh)] text-white/70">
              {t("goTo")} <span className="font-semibold text-white" dir="ltr">{location.host}/join</span> {t("andEnterCode")}
            </div>
            <div className="rounded-3xl bg-yellow-300 px-[3vw] py-[1vh] font-mono text-[min(9vw,15vh)] leading-none font-black tracking-[0.15em] text-slate-950" dir="ltr">{code}</div>
          </div>
        </div>
      ) : null}
      <div className="text-[min(3vw,5vh)] font-bold">
        <span className="tabular-nums text-yellow-300">{playerCount}</span> {t("players")}
      </div>
      {playerNames.length > 0 && (
        <div className="flex max-h-[18vh] max-w-[90vw] flex-wrap justify-center gap-2 overflow-hidden">
          <AnimatePresence>
            {playerNames.slice(-60).map((n, i) => (
              <motion.span key={`${n}-${i}`} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-full bg-white/10 px-4 py-1 text-[min(1.8vw,2.8vh)]" dir="auto">
                {n}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}
      {s.status === "paused" && <div className="text-[3vh] text-amber-300">{t("paused")}</div>}
    </div>
  );
}

function LiveView({ gameId, session: s, game, resolve, items }: StageProps) {
  const t = useT();
  const now = useNow(250);
  const bag = useBagItems(gameId, s.sheetSlot, items);
  const drawCount = s.draws.length;
  const last = s.draws[drawCount - 1];
  const [revealed, setRevealed] = useState<number>(drawCount);
  const drawn = useMemo(() => new Set(s.draws.slice(0, revealed).map((d) => d.itemId)), [s.draws, revealed]);
  useEffect(() => {
    // Draws that arrive while hidden (or when the bag shrinks) shouldn't stay unrevealed.
    if (drawCount < revealed) setRevealed(drawCount);
  }, [drawCount, revealed]);
  const previous = s.draws.slice(Math.max(0, revealed - 6), Math.max(0, revealed - 1)).reverse();
  const total = s.totalItems ?? bag.length;
  const blocker = autoDrawBlocker({ status: s.status, mode: s.mode, autoDraw: s.autoDraw, pendingClaims: s.pendingClaims, totalItems: s.totalItems, drawCount });
  const countdown = blocker === null ? secondsUntil(s.autoDraw.nextDrawAt, now) : null;

  return (
    <div className="grid h-full grid-cols-[minmax(0,42fr)_minmax(0,58fr)] gap-[2vw] p-[2vw]">
      <div className="flex min-h-0 flex-col items-center gap-[2vh]">
        <div className="flex w-full items-baseline justify-between gap-4">
          <h1 className="truncate text-[min(2.6vw,4.5vh)] font-black" dir="auto">{game.title}</h1>
          {s.joinCode && (
            <span className="shrink-0 text-[min(1.6vw,2.6vh)] text-white/60" dir="ltr">
              {location.host}/join · <b className="font-mono text-yellow-300">{s.joinCode}</b>
            </span>
          )}
        </div>
        <div className="relative w-full flex-1">
          <SpinReveal
            drawKey={drawCount}
            itemId={last?.itemId ?? null}
            pool={bag}
            className="absolute inset-0"
            onSettled={() => setRevealed(drawCount)}
            renderItem={(id) => (
              <div className="aspect-square h-full max-h-full max-w-full rounded-[3vh] bg-white p-[1vh] text-slate-950 shadow-[0_0_80px_rgba(250,204,21,0.45)]">
                <ItemTile itemId={id} resolve={resolve} className="h-full w-full" />
              </div>
            )}
            placeholder={<div className="text-[4vh] text-white/50">{t("noDrawsYet")}</div>}
          />
        </div>
        <div className="flex w-full items-center justify-between gap-4">
          <div className="text-[min(3.2vw,5.5vh)] font-black tabular-nums">
            <span className="text-white/60 text-[0.55em] font-semibold">{t("draws")} </span>
            <span dir="ltr">{fmt(t("drawOfTotal"), { n: revealed, total })}</span>
          </div>
          {countdown !== null && (
            <div className="rounded-full bg-white/10 px-[1.5vw] py-[0.5vh] text-[min(2.2vw,3.8vh)] tabular-nums">
              {t("nextDrawIn")} <b className="text-yellow-300">{countdown}</b>
            </div>
          )}
        </div>
        {previous.length > 0 && (
          <div className="w-full">
            <div className="mb-[0.6vh] text-[min(1.5vw,2.4vh)] text-white/60">{t("previousDraws")}</div>
            <div className="grid grid-cols-5 gap-[0.8vw]">
              {previous.map((d, i) => (
                <div key={`${revealed - 1 - i}`} className={cn("rounded-xl bg-white text-slate-950", i > 0 && "opacity-70")}>
                  <ItemTile itemId={d.itemId} resolve={resolve} className="w-full" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="relative min-h-0">
        <DrawnItemsGrid itemIds={bag} drawn={drawn} resolve={resolve} latest={revealed === drawCount ? last?.itemId : null} fit theme="dark" />
        {s.status === "paused" && <Banner text={t("paused")} />}
        {s.status === "live" && (s.pendingClaims ?? 0) > 0 && <Banner text={t("claimBeingChecked")} />}
        {s.status === "live" && blocker === "empty" && <Banner text={t("allDrawn")} />}
      </div>
    </div>
  );
}

function Banner({ text }: { text: string }) {
  return (
    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-slate-950/85 py-[3vh] text-center text-[min(4vw,7vh)] font-black text-yellow-300">{text}</div>
  );
}

function EndedView({ session: s, game }: StageProps) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3vh] p-[3vw] text-center">
      <p className="text-[3vh] text-white/60" dir="auto">{game.title}</p>
      <h1 className="text-[min(6vw,10vh)] font-black text-yellow-300">{t("roundEnded")}</h1>
      <div className="text-[min(3vw,5vh)]">
        {t("totalDraws")}: <b className="tabular-nums">{s.summary?.drawCount ?? s.draws.length}</b>
      </div>
      <h2 className="mt-[2vh] text-[min(3.4vw,5.5vh)] font-bold">{t("winners")}</h2>
      {s.winners.length === 0 ? (
        <p className="text-[3vh] text-white/70">{t("noWinners")}</p>
      ) : (
        <ol className="flex max-h-[45vh] flex-col flex-wrap items-center gap-[1.2vh] overflow-hidden">
          {s.winners.map((w, i) => (
            <li key={`${w.claimId}-${i}`} className="rounded-2xl bg-white/10 px-[2vw] py-[1vh] text-[min(2.8vw,4.6vh)]">
              🏆 <b dir="auto">{w.name}</b> <span className="text-white/60" dir="auto">· {patternLabel(t, { id: w.patternId, name: w.pattern })} · № {w.serial}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-[3vh] text-[min(3vw,5vh)] font-bold">{t("thankYou")}</p>
    </div>
  );
}

const WIN_SHOW_MS = 12_000;

/** Shows each new winner (one at a time) with the winning pattern on their board. */
function WinOverlay({ gameId, session: s, grid, resolve, slotLabel }: { gameId: string; session: Session; grid: { rows: number; cols: number }; resolve: Resolve; slotLabel: string }) {
  const t = useT();
  const seen = useRef(s.winners.length);
  const [queue, setQueue] = useState<Winner[]>([]);
  useEffect(() => {
    if (s.winners.length > seen.current) setQueue((q) => [...q, ...s.winners.slice(seen.current)]);
    seen.current = s.winners.length;
  }, [s.winners]);
  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    // A burst of winners (or a backlog) cycles faster so the room isn't kept waiting.
    const tm = setTimeout(() => setQueue((q) => q.slice(1)), queue.length > 2 ? WIN_SHOW_MS / 3 : WIN_SHOW_MS);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
  // Check the board against the draws up to the win.
  const drawnIds = useMemo(() => s.draws.map((d) => d.itemId), [s.draws]);
  const patternIds = useMemo(() => (current ? [current.patternId] : []), [current]);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={`${current.claimId}-${current.patternId}`}
          className="absolute inset-0 z-30 flex cursor-pointer items-center justify-center gap-[4vw] bg-slate-950/95 p-[3vw]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setQueue((q) => q.slice(1))}
        >
          <motion.div initial={{ scale: 0.5, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 12 }} className="flex max-w-[45vw] flex-col items-center gap-[2vh] text-center">
            <div className="text-[min(9vw,15vh)] leading-none font-black text-yellow-300">{t("bingo")}</div>
            {current.name && <div className="text-[min(5vw,9vh)] leading-tight font-black break-words" dir="auto">{current.name}</div>}
            <div className={cn("text-white/80", current.name ? "text-[min(2.6vw,4.4vh)]" : "text-[min(4vw,7vh)] font-bold text-white")}>
              <bdi>{fmt(t("sheetNo"), { serial: current.serial })}</bdi> · <bdi>{slotLabel}</bdi>
            </div>
            <div className="rounded-full bg-yellow-300 px-[2vw] py-[0.6vh] text-[min(2.4vw,4vh)] font-bold text-slate-950" dir="auto">
              {patternLabel(t, { id: current.patternId, name: current.pattern })}
            </div>
          </motion.div>
          <div className="aspect-square h-[min(80vh,45vw)] rounded-2xl bg-white p-[1vh] text-slate-950">
            <WinBoard gameId={gameId} serial={current.serial} slot={s.sheetSlot} grid={grid} drawnIds={drawnIds} patterns={s.patterns} patternIds={patternIds} resolve={resolve} label={fmt(t("sheetNo"), { serial: current.serial })} className="h-full w-full" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** How long a claim the host rejected stays up after it leaves the screen (ms). */
const REJECTED_LINGER_MS = 4000;
/** Grace for the claim's own decision to arrive after the session moved the screen on (ms). */
const DECISION_GRACE_MS = 1500;

/**
 * The claim being checked (`session.screenClaim`): the claimed sheet's board with drawn items
 * marked and any winning pattern highlighted, so the room can follow the host's check. A claim
 * that turns out valid gives way to the win overlay; one the host rejects stays up briefly.
 */
function ClaimScreen({ gameId, sessionId, session: s, grid, resolve, slotLabel }: { gameId: string; sessionId: string; session: Session; grid: { rows: number; cols: number }; resolve: Resolve; slotLabel: string }) {
  const t = useT();
  const target = s.screenClaim?.claimId ?? null;
  const [heldId, setHeldId] = useState(target);
  const claim = useDoc<Claim>(heldId ? `games/${gameId}/sessions/${sessionId}/claims/${heldId}` : null);
  const status = claim.data?.status;
  // Rejected while it was the one on screen (a host's paper check result): may leave at once.
  const wasInvalidOnScreen = useRef(false);
  if (heldId === target) wasInvalidOnScreen.current = status === "invalid";
  useEffect(() => {
    if (target === heldId) return;
    if (!heldId || status === "valid" || wasInvalidOnScreen.current) return setHeldId(target);
    const tm = setTimeout(() => setHeldId(target), status === "invalid" ? REJECTED_LINGER_MS : DECISION_GRACE_MS);
    return () => clearTimeout(tm);
  }, [target, heldId, status]);
  const drawnIds = useMemo(() => s.draws.map((d) => d.itemId), [s.draws]);
  const c = claim.data;
  const visible = !!c && c.status !== "valid";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={c.id}
          className="absolute inset-0 z-[25] flex items-center justify-center gap-[4vw] bg-slate-950/95 p-[3vw]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="claim-screen"
        >
          <div className="flex max-w-[40vw] flex-col items-center gap-[2vh] text-center">
            <div className="text-[min(2.6vw,4.4vh)] font-semibold text-white/70">{t("claimBeingChecked")}</div>
            {c.playerName && <div className="text-[min(5vw,9vh)] leading-tight font-black break-words" dir="auto">{c.playerName}</div>}
            <div className={cn(c.playerName ? "text-[min(2.6vw,4.4vh)] text-white/80" : "text-[min(4.4vw,8vh)] font-black")}>
              <bdi>{fmt(t("sheetNo"), { serial: c.serial })}</bdi> · <bdi>{slotLabel}</bdi>
            </div>
            {c.status === "pending" ? (
              <div className="animate-pulse rounded-full bg-white/15 px-[2vw] py-[0.6vh] text-[min(2.4vw,4vh)] font-bold text-yellow-300">{t("checking")}</div>
            ) : (
              <div className="rounded-full bg-rose-500 px-[2vw] py-[0.6vh] text-[min(2.4vw,4vh)] font-bold text-white">{t("claimInvalid")}</div>
            )}
          </div>
          <div className="aspect-square h-[min(80vh,48vw)] rounded-2xl bg-white p-[1vh] text-slate-950">
            <WinBoard gameId={gameId} serial={c.serial} slot={s.sheetSlot} grid={grid} drawnIds={drawnIds} patterns={s.patterns} patternIds={c.matchedPatternIds} resolve={resolve} label={fmt(t("sheetNo"), { serial: c.serial })} className="h-full w-full" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
