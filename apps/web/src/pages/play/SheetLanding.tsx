import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { liveRound } from "../../lib/callables";
import { useAuth } from "../../lib/hooks";
import { fmt, useT } from "../../lib/i18n";
import { Alert } from "../../components/ui";
import { normalizeSerialInput, readLastRound, writeLastRound } from "../../components/live/liveUtils";
import { JoinForm, type JoinResult } from "./JoinForm";
import { BigSpinnerMessage, LangSwitch, PlayerMessage, PlayerShell, ensureUser, playerError, useJoinLang } from "./playerCommon";

type State = { kind: "checking" } | { kind: "linking" } | { kind: "join" } | { kind: "error"; message: string; sessionId: string | null };

/**
 * Sheet QR landing (/s/:gameId/:serial): links the sheet in the player's active round for this
 * game, asking for the join code (and name) first when they aren't in one.
 */
export default function SheetLanding() {
  const { gameId = "", serial: rawSerial = "" } = useParams();
  const serial = normalizeSerialInput(rawSerial);
  const [lang, setLang] = useJoinLang();
  return (
    <PlayerShell lang={lang}>
      <LangSwitch onChange={setLang} />
      {serial ? <Landing gameId={gameId} serial={serial} /> : <BadSheet />}
    </PlayerShell>
  );
}

function BadSheet() {
  const t = useT();
  return (
    <PlayerMessage title={t("notASheetQr")}>
      <Link to="/join" className="rounded-xl bg-indigo-600 px-6 py-3 text-lg font-bold text-white">{t("joinWithCode")}</Link>
    </PlayerMessage>
  );
}

function Landing({ gameId, serial }: { gameId: string; serial: string }) {
  const t = useT();
  const navigate = useNavigate();
  const { loading: authLoading } = useAuth();
  const [state, setState] = useState<State>({ kind: "checking" });
  const started = useRef(false);

  const linkAndGo = async (sessionId: string) => {
    setState({ kind: "linking" });
    try {
      await liveRound({ action: "linkSheet", gameId, sessionId, serial });
      navigate(`/play/${gameId}/${sessionId}`, { replace: true });
    } catch (e) {
      setState({ kind: "error", message: playerError(e, t), sessionId });
    }
  };

  useEffect(() => {
    if (authLoading || started.current) return;
    started.current = true;
    const sessionId = readLastRound(localStorage, gameId);
    if (!sessionId) {
      setState({ kind: "join" });
      return;
    }
    (async () => {
      try {
        const user = await ensureUser();
        const snap = await getDoc(doc(db, `games/${gameId}/sessions/${sessionId}/players/${user.uid}`));
        if (!snap.exists()) return setState({ kind: "join" });
        await linkAndGo(sessionId);
      } catch {
        // Not a member of that round any more (or it was cleaned up): join a round first.
        setState({ kind: "join" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, gameId]);

  const onJoined = async (r: JoinResult) => {
    writeLastRound(localStorage, r.gameId, r.sessionId);
    if (r.gameId !== gameId) {
      setState({ kind: "error", message: t("wrongGame"), sessionId: null });
      navigate(`/play/${r.gameId}/${r.sessionId}`, { replace: true });
      return;
    }
    await linkAndGo(r.sessionId);
  };

  if (state.kind === "checking") return <BigSpinnerMessage text={t("loading")} />;
  if (state.kind === "linking") return <BigSpinnerMessage text={fmt(t("linkingSheet"), { serial })} />;
  if (state.kind === "error")
    return (
      <div className="mx-auto max-w-sm space-y-4 px-5 pt-10 text-center">
        <p className="font-mono text-2xl font-bold" dir="ltr">№ {serial}</p>
        <Alert kind="error">{state.message}</Alert>
        {state.sessionId && (
          <Link to={`/play/${gameId}/${state.sessionId}`} replace className="block rounded-xl bg-indigo-600 px-6 py-3 text-lg font-bold text-white">{t("toMyBoards")}</Link>
        )}
        <button className="text-slate-600 underline" onClick={() => setState({ kind: "join" })}>{t("joinWithCode")}</button>
      </div>
    );
  return (
    <div className="pt-4">
      <JoinForm intro={fmt(t("joinToLink"), { serial })} onJoined={onJoined} />
    </div>
  );
}
