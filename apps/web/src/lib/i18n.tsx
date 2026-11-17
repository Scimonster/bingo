import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Lang } from "@bingo/core";

/**
 * Player-facing string catalog (player app and projector). The host UI is English and uses
 * plain strings. Add keys to BOTH languages.
 */
const en = {
  join: "Join",
  joinCode: "Join code",
  yourName: "Your name",
  continue: "Continue",
  gettingSheet: "Getting your sheet…",
  waitingForSheets: "Waiting for the host to add sheets",
  waitingToStart: "Waiting for the host to start",
  bingo: "Bingo!",
  latestDraw: "Latest draw",
  linkMySheet: "Link my sheet",
  sheet: "Sheet",
  winners: "Winners",
  thankYou: "Thanks for playing!",
  roundEnded: "The round has ended",
  paused: "Paused",
  draws: "Draws",
  players: "Players",
  scanToJoin: "Scan to join",
  noDrawsYet: "No draws yet",
  claimPending: "Claim sent — waiting for the host",
  claimValid: "Bingo confirmed!",
  claimInvalid: "Not a bingo yet",
  missing: "missing",
  nextDrawIn: "Next draw in",
  totalDraws: "Total draws",
  winner: "Winner",
  invalidCode: "That code is not valid",
  enterSerial: "Sheet number",
  link: "Link",
  cancel: "Cancel",
} as const;

export type StringKey = keyof typeof en;

const he: Record<StringKey, string> = {
  join: "הצטרפות",
  joinCode: "קוד הצטרפות",
  yourName: "השם שלך",
  continue: "המשך",
  gettingSheet: "מקבלים את הכרטיס שלך…",
  waitingForSheets: "ממתינים שהמארח יוסיף כרטיסים",
  waitingToStart: "ממתינים שהמארח יתחיל",
  bingo: "בינגו!",
  latestDraw: "הגרלה אחרונה",
  linkMySheet: "קישור הכרטיס שלי",
  sheet: "כרטיס",
  winners: "זוכים",
  thankYou: "תודה ששיחקתם!",
  roundEnded: "הסבב הסתיים",
  paused: "מושהה",
  draws: "הגרלות",
  players: "שחקנים",
  scanToJoin: "סרקו כדי להצטרף",
  noDrawsYet: "עדיין אין הגרלות",
  claimPending: "הבקשה נשלחה — ממתינים למארח",
  claimValid: "בינגו אושר!",
  claimInvalid: "עדיין לא בינגו",
  missing: "חסרים",
  nextDrawIn: "ההגרלה הבאה בעוד",
  totalDraws: "סך ההגרלות",
  winner: "זוכה",
  invalidCode: "הקוד אינו תקין",
  enterSerial: "מספר כרטיס",
  link: "קישור",
  cancel: "ביטול",
};

const catalogs: Record<Lang, Record<StringKey, string>> = { en, he };

const LangContext = createContext<Lang>("en");

/** Wraps player-facing screens: sets <html lang dir> and the string catalog. */
export function PlayerLanguage({ lang, children }: { lang: Lang; children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    const prev = { lang: html.lang, dir: html.dir };
    html.lang = lang;
    html.dir = lang === "he" ? "rtl" : "ltr";
    return () => {
      html.lang = prev.lang;
      html.dir = prev.dir;
    };
  }, [lang]);
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useT(): (key: StringKey) => string {
  const lang = useContext(LangContext);
  return (key) => catalogs[lang][key];
}

export function useLang(): Lang {
  return useContext(LangContext);
}
