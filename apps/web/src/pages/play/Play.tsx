import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FieldPath, doc, updateDoc, where } from "firebase/firestore";
import { SheetStyles, type Resolve } from "@bingo/sheet";
import type { Claim, ClaimStatus, Player, Session, Winner } from "@bingo/core";
import { db } from "../../lib/firebase";
import { liveRound } from "../../lib/callables";
import { useAuth, useCollection, useDoc } from "../../lib/hooks";
import { fmt, useT } from "../../lib/i18n";
import { cn } from "../../components/ui";
import { ItemTile, useGameContent } from "../../components/live/content";
import { toggleMark, writeLastRound } from "../../components/live/liveUtils";
import { patternLabel } from "../../components/live/patterns";
import { BigSpinnerMessage, PlayerMessage, PlayerShell, playerError } from "./playerCommon";
import { PlayerBoard } from "./PlayerBoard";
import { LinkSheetDialog } from "./LinkSheetDialog";

export default function Play() {
  const { gameId = "", sessionId = "" } = useParams();
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;
  const base = `games/${gameId}/sessions/${sessionId}`;
  const session = useDoc<Session>(uid ? base : null);
  const player = useDoc<Player>(uid ? `${base}/players/${uid}` : null);
  const content = useGameContent(gameId, !!uid);
  const lang = content.game.data?.playerLanguage ?? "he";

  useEffect(() => {
    if (player.data) writeLastRound(localStorage, gameId, sessionId);
  }, [player.data, gameId, sessionId]);

  if (authLoading) return <PlayerShell lang={lang}><BigSpinnerMessage text="…" /></PlayerShell>;
  if (!uid) return <Navigate to="/join" replace />;
  const loading = session.loading || player.loading || content.game.loading;
  return (
    <PlayerShell lang={lang}>
      <SheetStyles />
      {loading ? (
        <LoadingMsg />
      ) : !session.data || !player.data || !content.game.data ? (
        <NotInRound />
      ) : (
        <PlayView
          gameId={gameId}
          sessionId={sessionId}
          uid={uid}
          session={session.data}
          player={player.data}
          title={content.game.data.title}
          grid={{ rows: content.game.data.settings.rows, cols: content.game.data.settings.cols }}
          resolve={content.resolve}
        />
      )}
    </PlayerShell>
  );
}

function LoadingMsg() {
  const t = useT();
  return <BigSpinnerMessage text={t("loading")} />;
}

function NotInRound() {
  const t = useT();
  return (
    <PlayerMessage title={t("notInRound")}>
      <Link to="/join" className="rounded-xl bg-indigo-600 px-6 py-3 text-lg font-bold text-white">{t("joinWithCode")}</Link>
    </PlayerMessage>
  );
}

function PlayView({
  gameId, sessionId, uid, session: s, player, title, grid, resolve,
}: {
  gameId: string;
  sessionId: string;
  uid: string;
  session: Session;
  player: Player;
  title: string;
  grid: { rows: number; cols: number };
  resolve: Resolve;
}) {
  const t = useT();
  const base = `games/${gameId}/sessions/${sessionId}`;
  const claims = useCollection<Claim>(`${base}/claims`, [where("uid", "==", uid)], uid);
  const drawnIds = useMemo(() => s.draws.map((d) => d.itemId), [s.draws]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [claimBusy, setClaimBusy] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  const playerRef = useMemo(() => doc(db, `${base}/players/${uid}`), [base, uid]);
  const onToggle = useCallback(
    (serial: string, index: number) => {
      if (s.status === "ended") return;
      void updateDoc(playerRef, new FieldPath("marks", serial), toggleMark(player.marks?.[serial], index)).catch(() => undefined);
    },
    [playerRef, player.marks, s.status],
  );

  const onClaim = async (serial: string) => {
    setClaimBusy(serial);
    setClaimError(null);
    try {
      await liveRound({ action: "submitClaim", gameId, sessionId, serial });
    } catch (e) {
      setClaimError(playerError(e, t));
    } finally {
      setClaimBusy(null);
    }
  };

  // Latest claim status per serial.
  const claimBySerial = useMemo(() => {
    const m: Record<string, ClaimStatus> = {};
    for (const c of [...claims.data].sort((a, b) => a.createdAt - b.createdAt)) m[c.serial] = c.status;
    return m;
  }, [claims.data]);

  useEffect(() => {
    if (!notice) return;
    const tm = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(tm);
  }, [notice]);

  if (s.status === "ended") return <EndedView title={title} session={s} mySheets={player.sheets} />;

  const central = s.mode === "central";
  const paper = s.medium === "paper";
  const sheets = player.sheets;
  const last = s.draws[s.draws.length - 1];
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setActive(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  };
  const goTo = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    const dir = getComputedStyle(el).direction === "rtl" ? -1 : 1;
    el.scrollTo({ left: dir * i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="flex items-center gap-2 px-4 pt-3">
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold" dir="auto">{title}</h1>
        <span className="truncate text-sm text-slate-600" dir="auto">{player.name}</span>
      </header>

      {central && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-indigo-600 p-2 pe-4 text-white shadow">
          <AnimatePresence mode="popLayout" initial={false}>
            {last ? (
              <motion.div key={s.draws.length} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="w-20 shrink-0 rounded-xl bg-white text-slate-900">
                <ItemTile itemId={last.itemId} resolve={resolve} className="w-full" />
              </motion.div>
            ) : (
              <div className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-white/15 text-3xl">🎱</div>
            )}
          </AnimatePresence>
          <div className="min-w-0">
            <div className="text-sm opacity-80">{t("latestDraw")}</div>
            <div className="text-xl font-bold">{last ? fmt(t("drawN"), { n: s.draws.length }) : t("noDrawsYet")}</div>
          </div>
        </div>
      )}

      {s.status !== "live" && (
        <div className={cn("mx-4 mt-3 rounded-xl px-4 py-3 text-center text-lg font-semibold", s.status === "paused" ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-900")} role="status">
          {s.status === "paused" ? t("paused") : t("waitingToStart")}
        </div>
      )}

      <main className="flex flex-1 flex-col py-3">
        {sheets.length === 0 ? (
          player.waitingForSheets > 0 ? (
            <BigSpinnerMessage text={t("waitingForSheets")} />
          ) : paper ? (
            <PlayerMessage title={t("noSheetsPaper")}>
              <button onClick={() => setLinkOpen(true)} className="h-14 rounded-2xl bg-indigo-600 px-8 text-xl font-bold text-white shadow">{t("linkMySheet")}</button>
            </PlayerMessage>
          ) : (
            <BigSpinnerMessage text={t("gettingSheet")} />
          )
        ) : (
          <>
            <div ref={scroller} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]">
              {sheets.map((serial) => (
                <div key={serial} className="w-full shrink-0 snap-center px-3">
                  <PlayerBoard
                    gameId={gameId}
                    serial={serial}
                    slot={s.sheetSlot}
                    grid={grid}
                    resolve={resolve}
                    mode={s.mode}
                    drawnIds={drawnIds}
                    patterns={s.patterns}
                    marks={player.marks?.[serial]}
                    autoMark={s.autoMark}
                    onToggle={onToggle}
                    onClaim={central ? onClaim : undefined}
                    claimBusy={claimBusy === serial}
                    claimStatus={claimBySerial[serial] ?? null}
                    canClaim={s.status === "live" || s.status === "paused"}
                  />
                </div>
              ))}
            </div>
            {sheets.length > 1 && (
              <div className="mt-3 flex items-center justify-center gap-2">
                {sheets.map((serial, i) => (
                  <button key={serial} onClick={() => goTo(i)} aria-label={fmt(t("boardOfN"), { i: i + 1, n: sheets.length })} className={cn("h-3 rounded-full transition-all", i === active ? "w-8 bg-indigo-600" : "w-3 bg-slate-300")} />
                ))}
              </div>
            )}
            {!s.autoMark && <p className="mt-2 text-center text-sm text-slate-500">{t("markHint")}</p>}
            {claimError && <p className="mx-4 mt-2 rounded-lg bg-rose-50 p-2 text-center text-rose-800" role="alert">{claimError}</p>}
            {paper && (
              <button onClick={() => setLinkOpen(true)} className="mx-auto mt-4 rounded-xl border border-indigo-300 px-5 py-3 font-semibold text-indigo-700">{t("linkMySheet")}</button>
            )}
          </>
        )}
      </main>

      <WinnerToasts winners={s.winners} mySheets={sheets} />
      <AnimatePresence>
        {notice && (
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-x-4 bottom-4 z-40 rounded-xl bg-slate-900 p-4 text-center text-white shadow-xl" role="status">
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
      {linkOpen && (
        <LinkSheetDialog
          gameId={gameId}
          sessionId={sessionId}
          onClose={() => setLinkOpen(false)}
          onLinked={(serial) => {
            setLinkOpen(false);
            setNotice(fmt(t("sheetLinked"), { serial }));
          }}
        />
      )}
    </div>
  );
}

/** Pops a toast for each winner announced while the screen is open. */
function WinnerToasts({ winners, mySheets }: { winners: Winner[]; mySheets: string[] }) {
  const t = useT();
  const seen = useRef(winners.length);
  const [toasts, setToasts] = useState<(Winner & { key: string })[]>([]);
  useEffect(() => {
    if (winners.length > seen.current) {
      const fresh = winners.slice(seen.current).map((w, i) => ({ ...w, key: `${w.claimId}-${seen.current + i}` }));
      setToasts((ts) => [...ts, ...fresh]);
      for (const f of fresh) setTimeout(() => setToasts((ts) => ts.filter((x) => x.key !== f.key)), 6000);
    }
    seen.current = winners.length;
  }, [winners]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((w) => {
          const mine = mySheets.includes(w.serial);
          return (
            <motion.div key={w.key} initial={{ y: -40, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -20 }} className={cn("w-full max-w-md rounded-2xl px-4 py-3 text-center text-lg font-bold shadow-xl", mine ? "bg-emerald-500 text-white" : "bg-amber-300 text-amber-950")} role="status">
              🎉 {mine ? t("youWon") : null} <span dir="auto">{fmt(t("winnerToast"), { name: w.name, pattern: patternLabel(t, { id: w.patternId, name: w.pattern }) })}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function EndedView({ title, session: s, mySheets }: { title: string; session: Session; mySheets: string[] }) {
  const t = useT();
  return (
    <div className="mx-auto max-w-md px-5 py-12 text-center">
      <p className="text-sm text-slate-500" dir="auto">{title}</p>
      <h1 className="mt-1 text-3xl font-black">{t("roundEnded")}</h1>
      <h2 className="mt-8 mb-3 text-xl font-bold">{t("winners")}</h2>
      {s.winners.length === 0 ? (
        <p className="text-slate-600">{t("noWinners")}</p>
      ) : (
        <ol className="space-y-2">
          {s.winners.map((w, i) => (
            <li key={`${w.claimId}-${i}`} className={cn("rounded-xl px-4 py-3 text-lg", mySheets.includes(w.serial) ? "bg-emerald-100 font-bold" : "bg-white shadow-sm")}>
              🏆 <span dir="auto">{w.name}</span> <span className="text-sm text-slate-500" dir="auto">· {patternLabel(t, { id: w.patternId, name: w.pattern })} · № {w.serial}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-10 text-2xl font-bold">{t("thankYou")}</p>
    </div>
  );
}
