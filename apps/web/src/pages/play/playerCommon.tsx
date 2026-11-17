import { useState, type ReactNode } from "react";
import { signInAnonymously, type User } from "firebase/auth";
import type { Lang } from "@bingo/core";
import { auth } from "../../lib/firebase";
import { PlayerLanguage, useLang, type StringKey } from "../../lib/i18n";
import { cn } from "../../components/ui";

/** The signed-in user, signing in anonymously when nobody is. */
export async function ensureUser(): Promise<User> {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

const REASONS: Record<string, StringKey> = {
  "bad-code": "invalidCode",
  "round-ended": "roundEnded",
  "not-joined": "notInRound",
  "player-not-found": "notInRound",
  "not-live": "waitingToStart",
  "sheet-not-found": "errSheetNotFound",
  "sheet-taken": "errSheetTaken",
  "sheet-cap": "errSheetCap",
  "not-your-sheet": "errNotYourSheet",
  "bad-token": "displayLinkFailed",
  "token-used": "displayLinkFailed",
  "token-expired": "displayLinkFailed",
};

/** Machine-readable reason of a callable error (`details.reason` set by the Functions). */
export function errorReason(e: unknown): string | null {
  const d = e && typeof e === "object" && "details" in e ? (e as { details: unknown }).details : null;
  return d && typeof d === "object" && "reason" in d ? String((d as { reason: unknown }).reason) : null;
}

/** Player-language error text for a callable failure (Function messages are English). */
export function playerError(e: unknown, t: (k: StringKey) => string, fallback: StringKey = "error"): string {
  const reason = errorReason(e);
  if (reason && REASONS[reason]) return t(REASONS[reason]);
  return t(fallback);
}

const JOIN_LANG_KEY = "bingo:joinLang";

/** Language for screens shown before we know the game (join, sheet landing): Hebrew by default, switchable. */
export function useJoinLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return localStorage.getItem(JOIN_LANG_KEY) === "en" ? "en" : "he";
    } catch {
      return "he";
    }
  });
  return [
    lang,
    (l) => {
      setLang(l);
      try {
        localStorage.setItem(JOIN_LANG_KEY, l);
      } catch {
        /* ignore */
      }
    },
  ];
}

/** Phone-first page shell for the player app. */
export function PlayerShell({ lang, children, className }: { lang: Lang; children: ReactNode; className?: string }) {
  return (
    <PlayerLanguage lang={lang}>
      <div className={cn("min-h-dvh bg-gradient-to-b from-indigo-50 to-white text-slate-900", className)}>{children}</div>
    </PlayerLanguage>
  );
}

export function LangSwitch({ onChange }: { onChange: (l: Lang) => void }) {
  const lang = useLang();
  return (
    <div className="flex justify-end gap-1 p-3 text-sm">
      {(["he", "en"] as const).map((l) => (
        <button key={l} onClick={() => onChange(l)} className={cn("rounded-md px-2 py-1", l === lang ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100")} aria-pressed={l === lang}>
          {l === "he" ? "עברית" : "English"}
        </button>
      ))}
    </div>
  );
}

export function BigSpinnerMessage({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center" role="status">
      <span className="inline-block size-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      <p className="text-xl font-semibold">{text}</p>
    </div>
  );
}

/** Translated message + optional actions, centered. */
export function PlayerMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
      <p className="text-2xl font-bold">{title}</p>
      {children}
    </div>
  );
}
