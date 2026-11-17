import { doc, updateDoc } from "firebase/firestore";
import { LIMITS } from "@bingo/core";
import { db } from "../../lib/firebase";
import { Alert, Card, Select } from "../../components/ui";
import { useAction } from "../../components/live/useAction";
import type { SessionDoc } from "./HostConsole";

/** Round options the host may still change while the round runs (owner client writes). */
export function RoundSettings({ sessionPath, session: s }: { sessionPath: string; session: SessionDoc }) {
  const { busy, error, run } = useAction();
  const set = (patch: Partial<Pick<SessionDoc, "verification" | "autoMark" | "onWin" | "boardsPerPlayer">>) =>
    run("settings", () => updateDoc(doc(db, sessionPath), patch));
  const disabled = busy === "settings" || s.status === "ended";
  return (
    <Card className="space-y-3 text-sm">
      <h2 className="text-lg font-bold">Round settings</h2>
      <p className="text-slate-600">
        Patterns: <span dir="auto">{s.patterns.map((p) => p.name).join(", ")}</span>
      </p>
      {s.mode === "central" && (
        <label className="flex items-center justify-between gap-2">
          Claim verification
          <Select value={s.verification} disabled={disabled} onChange={(e) => set({ verification: e.target.value as SessionDoc["verification"] })}>
            <option value="auto">Automatic</option>
            <option value="host">I confirm each claim</option>
          </Select>
        </label>
      )}
      {s.mode === "central" && (
        <label className="flex items-center justify-between gap-2">
          After a win
          <Select value={s.onWin} disabled={disabled} onChange={(e) => set({ onWin: e.target.value as SessionDoc["onWin"] })}>
            <option value="continue">Keep playing</option>
            <option value="end">End the round</option>
          </Select>
        </label>
      )}
      {s.mode === "central" && (
        <label className="flex items-center justify-between gap-2">
          Mark drawn items automatically
          <input type="checkbox" className="size-5 accent-indigo-600" checked={s.autoMark} disabled={disabled} onChange={(e) => set({ autoMark: e.target.checked })} />
        </label>
      )}
      <label className="flex items-center justify-between gap-2">
        {s.medium === "digital" ? "Sheets per player" : "Sheets a player may link"}
        <Select value={s.boardsPerPlayer} disabled={disabled} onChange={(e) => set({ boardsPerPlayer: Number(e.target.value) })}>
          {Array.from({ length: LIMITS.sheetsPerPlayerMax }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </Select>
      </label>
      {error && <Alert kind="error">{error}</Alert>}
    </Card>
  );
}
