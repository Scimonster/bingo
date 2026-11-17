import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { signInAnonymously } from "firebase/auth";
import type { RedeemDisplayTokenResponse } from "@bingo/core";
import { auth } from "../../lib/firebase";
import { errorMessage, redeemDisplayToken } from "../../lib/callables";
import { useAuth } from "../../lib/hooks";
import { PlayerLanguage, useT } from "../../lib/i18n";

// Tokens are single-use: share one redemption per token across StrictMode re-mounts.
const redemptions = new Map<string, Promise<RedeemDisplayTokenResponse>>();

function redeemOnce(token: string): Promise<RedeemDisplayTokenResponse> {
  let p = redemptions.get(token);
  if (!p) {
    p = (async () => {
      if (!auth.currentUser) await signInAnonymously(auth);
      return redeemDisplayToken(token);
    })();
    redemptions.set(token, p);
  }
  return p;
}

/** /display/:token — signs the device in anonymously, redeems the link, opens the projector. */
export default function DisplayRedeem() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (loading) return;
    let alive = true;
    redeemOnce(token).then(
      (r) => alive && navigate(`/present/${r.gameId}/${r.sessionId}`, { replace: true }),
      (e: unknown) => alive && setError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [loading, token, navigate]);
  return (
    <PlayerLanguage lang="he">
      <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-slate-950 p-10 text-center text-white">
        <Status error={error} />
      </div>
    </PlayerLanguage>
  );
}

function Status({ error }: { error: string | null }) {
  const t = useT();
  if (error)
    return (
      <>
        <p className="text-4xl font-bold">{t("displayLinkFailed")}</p>
        <p className="text-white/60" dir="auto">{error}</p>
      </>
    );
  return (
    <>
      <span className="inline-block size-16 animate-spin rounded-full border-4 border-yellow-300 border-t-transparent" />
      <p className="text-3xl">{t("connectingDisplay")}</p>
    </>
  );
}
