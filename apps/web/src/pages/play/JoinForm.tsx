import { useEffect, useRef, useState } from "react";
import { LIMITS, isValidJoinCode, normalizeJoinCode, type LiveRoundResponses } from "@bingo/core";
import { liveRound } from "../../lib/callables";
import { useT } from "../../lib/i18n";
import { Alert, Button, Input } from "../../components/ui";
import { BigSpinnerMessage, ensureUser, playerError } from "./playerCommon";

const NAME_KEY = "bingo:playerName";

export type JoinResult = LiveRoundResponses["joinRound"];

/** Code → name → joinRound. Calls onJoined with the response (the caller navigates). */
export function JoinForm({ initialCode, intro, onJoined }: { initialCode?: string; intro?: string; onJoined: (r: JoinResult) => Promise<void> | void }) {
  const t = useT();
  const startCode = normalizeJoinCode(initialCode ?? "");
  const [code, setCode] = useState(startCode);
  const [step, setStep] = useState<"code" | "name" | "joining">(isValidJoinCode(startCode) ? "name" : "code");
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === "name") nameRef.current?.focus();
  }, [step]);

  const normalized = normalizeJoinCode(code);
  const codeValid = isValidJoinCode(normalized);

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeValid) {
      setError(t("invalidCode"));
      return;
    }
    setError(null);
    setStep("name");
  };

  const submitName = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (n.length < LIMITS.playerNameMin) {
      setError(t("nameRequired"));
      return;
    }
    setError(null);
    setStep("joining");
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* ignore */
    }
    try {
      await ensureUser();
      const r = await liveRound({ action: "joinRound", code: normalized, name: n });
      await onJoined(r);
    } catch (err) {
      const c = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      setError(c === "functions/not-found" ? t("invalidCode") : playerError(err, t, "joinFailed"));
      setStep(c === "functions/not-found" ? "code" : "name");
    }
  };

  if (step === "joining") return <BigSpinnerMessage text={t("gettingSheet")} />;

  return (
    <div className="mx-auto w-full max-w-sm px-5 pb-10">
      <h1 className="mb-2 text-center text-3xl font-black">{t("joinTitle")}</h1>
      {intro && <p className="mb-4 text-center text-slate-600">{intro}</p>}
      {step === "code" ? (
        <form onSubmit={submitCode} className="space-y-4">
          <label htmlFor="join-code" className="block text-center text-slate-600">{t("enterCodeHint")}</label>
          <Input
            id="join-code"
            dir="ltr"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            aria-label={t("joinCode")}
            className="h-16 text-center font-mono text-3xl font-bold tracking-[0.3em] uppercase"
          />
          {error && <Alert kind="error">{error}</Alert>}
          <Button type="submit" size="lg" className="h-14 w-full text-xl" disabled={!normalized}>{t("continue")}</Button>
        </form>
      ) : (
        <form onSubmit={submitName} className="space-y-4">
          <div className="text-center">
            <span className="text-sm text-slate-500">{t("joinCode")}: </span>
            <button type="button" className="font-mono text-lg font-bold tracking-widest underline decoration-dotted" dir="ltr" onClick={() => setStep("code")}>{normalized}</button>
          </div>
          <label htmlFor="player-name" className="block text-center text-lg font-semibold">{t("yourName")}</label>
          <Input
            id="player-name"
            ref={nameRef}
            dir="auto"
            autoComplete="nickname"
            maxLength={LIMITS.playerNameMax}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-14 text-center text-2xl"
          />
          {error && <Alert kind="error">{error}</Alert>}
          <Button type="submit" size="lg" className="h-14 w-full text-xl" disabled={!name.trim()}>{t("join")}</Button>
          <button type="button" className="block w-full text-center text-sm text-slate-500 underline" onClick={() => setStep("code")}>{t("back")}</button>
        </form>
      )}
    </div>
  );
}
