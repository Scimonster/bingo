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
  // Join
  joinTitle: "Join a bingo round",
  enterCodeHint: "Enter the code shown by the host",
  back: "Back",
  joinFailed: "Could not join the round",
  nameRequired: "Please enter your name",
  // Play
  notInRound: "You're not in this round",
  joinWithCode: "Join with a code",
  sheetNo: "Sheet № {serial}",
  boardOfN: "{i} of {n}",
  drawN: "Draw {n}",
  markHint: "Tap a cell to mark it",
  checking: "Checking…",
  youHaveBingo: "You have a bingo — tap Bingo!",
  oneToGo: "One more for {pattern}!",
  nToGo: "{n} more for {pattern}",
  winnerToast: "{name} won ({pattern})",
  youWon: "You won!",
  noSheetsPaper: "Playing on paper? Link the sheet you're holding to follow along here.",
  noWinners: "No winners this round",
  loading: "Loading…",
  error: "Something went wrong",
  // Link sheet
  scanQr: "Point the camera at the QR code on your sheet",
  cameraUnavailable: "Camera not available — type the sheet number instead",
  wrongGame: "That sheet belongs to a different game",
  notASheetQr: "That QR code is not a bingo sheet",
  sheetLinked: "Sheet № {serial} linked",
  linking: "Linking…",
  or: "or",
  linkingSheet: "Linking sheet № {serial}…",
  joinToLink: "Enter the round's join code to link sheet № {serial}",
  toMyBoards: "To my boards",
  // Projector
  goTo: "Go to",
  andEnterCode: "and enter the code",
  fullscreen: "Full screen",
  exitFullscreen: "Exit full screen",
  drawOfTotal: "{n} / {total}",
  previousDraws: "Previous draws",
  claimBeingChecked: "Checking a bingo claim…",
  allDrawn: "All items have been drawn",
  connectingDisplay: "Connecting display…",
  displayLinkFailed: "This display link is invalid or has already been used",
  // Patterns
  pattern_line: "Any line",
  pattern_row: "Any row",
  pattern_column: "Any column",
  pattern_diagonal: "Diagonal",
  pattern_corners: "Four corners",
  pattern_blackout: "Full house",
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
  // Join
  joinTitle: "הצטרפות לסבב בינגו",
  enterCodeHint: "הקלידו את הקוד שהמארח מציג",
  back: "חזרה",
  joinFailed: "לא ניתן להצטרף לסבב",
  nameRequired: "נא להקליד שם",
  // Play
  notInRound: "אינכם משתתפים בסבב הזה",
  joinWithCode: "הצטרפות עם קוד",
  sheetNo: "כרטיס № {serial}",
  boardOfN: "{i} מתוך {n}",
  drawN: "הגרלה {n}",
  markHint: "הקישו על משבצת כדי לסמן אותה",
  checking: "בודקים…",
  youHaveBingo: "יש לכם בינגו — לחצו על בינגו!",
  oneToGo: "עוד אחד ל{pattern}!",
  nToGo: "עוד {n} ל{pattern}",
  winnerToast: "{name} ניצח/ה ({pattern})",
  youWon: "ניצחתם!",
  noSheetsPaper: "משחקים על נייר? קשרו את הכרטיס שבידכם כדי לעקוב כאן.",
  noWinners: "אין זוכים בסבב הזה",
  loading: "טוען…",
  error: "משהו השתבש",
  // Link sheet
  scanQr: "כוונו את המצלמה לקוד ה-QR שעל הכרטיס",
  cameraUnavailable: "המצלמה אינה זמינה — הקלידו את מספר הכרטיס",
  wrongGame: "הכרטיס הזה שייך למשחק אחר",
  notASheetQr: "קוד ה-QR הזה אינו כרטיס בינגו",
  sheetLinked: "כרטיס № {serial} קושר",
  linking: "מקשרים…",
  or: "או",
  linkingSheet: "מקשרים את כרטיס № {serial}…",
  joinToLink: "הקלידו את קוד ההצטרפות של הסבב כדי לקשר את כרטיס № {serial}",
  toMyBoards: "ללוחות שלי",
  // Projector
  goTo: "היכנסו ל־",
  andEnterCode: "והקלידו את הקוד",
  fullscreen: "מסך מלא",
  exitFullscreen: "יציאה ממסך מלא",
  drawOfTotal: "{n} / {total}",
  previousDraws: "הגרלות קודמות",
  claimBeingChecked: "בודקים בקשת בינגו…",
  allDrawn: "כל הפריטים הוגרלו",
  connectingDisplay: "מחברים את התצוגה…",
  displayLinkFailed: "קישור התצוגה אינו תקין או שכבר נעשה בו שימוש",
  // Patterns
  pattern_line: "שורה כלשהי",
  pattern_row: "שורה אופקית",
  pattern_column: "טור",
  pattern_diagonal: "אלכסון",
  pattern_corners: "ארבע פינות",
  pattern_blackout: "לוח מלא",
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

/** Fills `{name}` placeholders. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function useLang(): Lang {
  return useContext(LangContext);
}
