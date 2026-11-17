import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { BUILTIN_PATTERNS, DEFAULTS, LIMITS, expandPattern, freeIndex, isValidCustomPattern, type Medium, type Mode, type OnWin, type Pattern, type Verification } from "@bingo/core";
import { Alert, Button, Dialog, Input, Label, Select, cn } from "../../components/ui";
import { MAX_CUSTOM_PATTERNS, PatternEditor } from "../../components/setup/PatternEditor";
import { db } from "../../lib/firebase";
import { errorMessage, liveRound } from "../../lib/callables";
import { clean, type GameDoc } from "./types";

export function displayTokenKey(sessionId: string) {
  return `bingo:displayToken:${sessionId}`;
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-700">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <label key={o.id} className={cn("cursor-pointer rounded-lg border p-2 text-sm", value === o.id ? "border-indigo-600 bg-indigo-50" : "border-slate-300 bg-white hover:bg-slate-50")}>
            <input type="radio" className="sr-only" name={label} checked={value === o.id} onChange={() => onChange(o.id)} />
            <span className="font-medium">{o.label}</span>
            {o.hint && <span className="block text-xs text-slate-500">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function StartRoundDialog({ gameId, game, defaultSlot, playedSlots, onClose }: { gameId: string; game: GameDoc; defaultSlot: number; playedSlots: Set<number>; onClose: () => void }) {
  const navigate = useNavigate();
  const { settings, printLayout } = game;
  const grid = { rows: settings.rows, cols: settings.cols };
  const [medium, setMedium] = useState<Medium>("paper");
  const [mode, setMode] = useState<Mode>("central");
  const [slot, setSlot] = useState(defaultSlot);
  const [verification, setVerification] = useState<Verification>("auto");
  const [selected, setSelected] = useState<string[]>(["line"]);
  const [boardsPerPlayer, setBoardsPerPlayer] = useState<number>(DEFAULTS.sheetsPerPlayer);
  const [autoMark, setAutoMark] = useState(false);
  const [onWin, setOnWin] = useState<OnWin>("continue");
  const [interval, setIntervalSec] = useState<number>(DEFAULTS.autoDrawIntervalSec);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const builtins = useMemo(() => BUILTIN_PATTERNS.map((p) => ({ p, ok: expandPattern(p, grid).length > 0 })), [grid.rows, grid.cols]); // eslint-disable-line react-hooks/exhaustive-deps
  const customs = useMemo(() => (game.customPatterns ?? []).map((p) => ({ p, ok: isValidCustomPattern(p, grid) })), [game.customPatterns, grid.rows, grid.cols]); // eslint-disable-line react-hooks/exhaustive-deps
  const all: Pattern[] = [...builtins, ...customs].filter((x) => x.ok).map((x) => x.p);
  const chosen = all.filter((p) => selected.includes(p.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= LIMITS.patternsPerRoundMax ? s : [...s, id]));

  const saveCustom = async (p: Pattern) => {
    const list = game.customPatterns ?? [];
    if (list.length >= MAX_CUSTOM_PATTERNS) throw new Error(`At most ${MAX_CUSTOM_PATTERNS} custom patterns`);
    await updateDoc(doc(db, "games", gameId), { customPatterns: clean([...list, p]) });
    setSelected((s) => (s.length >= LIMITS.patternsPerRoundMax ? s : [...s, p.id]));
    setEditing(false);
  };
  const deleteCustom = async (id: string) => {
    try {
      await updateDoc(doc(db, "games", gameId), { customPatterns: (game.customPatterns ?? []).filter((p) => p.id !== id) });
      setSelected((s) => s.filter((x) => x !== id));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await liveRound({
        action: "startRound",
        gameId,
        options: clean({
          medium,
          mode,
          slot,
          verification,
          patterns: chosen,
          boardsPerPlayer,
          autoMark,
          onWin,
          autoDrawIntervalSec: interval,
        }),
      });
      try {
        sessionStorage.setItem(displayTokenKey(res.sessionId), res.displayToken);
      } catch {
        /* storage unavailable */
      }
      navigate(`/games/${gameId}/rounds/${res.sessionId}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const intervalOk = Number.isInteger(interval) && interval >= LIMITS.autoDrawMinSec && interval <= LIMITS.autoDrawMaxSec;

  return (
    <Dialog title="Start a round" onClose={() => !busy && onClose()} className="max-w-2xl">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Segmented
            label="Medium"
            value={medium}
            onChange={setMedium}
            options={[
              { id: "paper", label: "Paper", hint: "Players hold printed sheets" },
              { id: "digital", label: "Digital", hint: "Sheets assigned to phones" },
            ]}
          />
          <Segmented
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { id: "central", label: "Central", hint: "You draw; claims are checked" },
              { id: "self", label: "Self", hint: "Players mark their own, no checks" },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="round-slot">Board slot</Label>
            <Select id="round-slot" className="w-full" value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
              {Array.from({ length: settings.boardsPerSheet }, (_, i) => (
                <option key={i} value={i}>
                  {printLayout.slotLabels[i] || `Slot ${i + 1}`}
                  {playedSlots.has(i) ? " (played)" : ""}
                </option>
              ))}
            </Select>
          </div>
          {medium === "digital" && (
            <div>
              <Label htmlFor="round-bpp">Sheets per player</Label>
              <Input id="round-bpp" type="number" min={LIMITS.sheetsPerPlayerMin} max={LIMITS.sheetsPerPlayerMax} value={boardsPerPlayer} onChange={(e) => setBoardsPerPlayer(Math.min(LIMITS.sheetsPerPlayerMax, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
          )}
        </div>
        {mode === "central" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Segmented
              label="Claim verification"
              value={verification}
              onChange={setVerification}
              options={[
                { id: "auto", label: "Automatic", hint: "Valid claims win at once" },
                { id: "host", label: "I confirm", hint: "You accept or reject" },
              ]}
            />
            <Segmented
              label="When someone wins"
              value={onWin}
              onChange={setOnWin}
              options={[
                { id: "continue", label: "Keep playing" },
                { id: "end", label: "End round" },
              ]}
            />
            <div>
              <Label htmlFor="round-interval">Auto-draw interval (seconds)</Label>
              <Input id="round-interval" type="number" min={LIMITS.autoDrawMinSec} max={LIMITS.autoDrawMaxSec} value={interval} onChange={(e) => setIntervalSec(Number(e.target.value))} aria-invalid={!intervalOk} />
              <p className="mt-1 text-xs text-slate-500">Auto-draw is off until you turn it on in the console. {LIMITS.autoDrawMinSec}–{LIMITS.autoDrawMaxSec} s.</p>
            </div>
          </div>
        )}
        {(medium === "digital" || mode === "self") && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={autoMark} onChange={(e) => setAutoMark(e.target.checked)} />
            Auto-mark drawn items on players' boards
          </label>
        )}
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">
            Winning patterns ({chosen.length}/{LIMITS.patternsPerRoundMax})
          </legend>
          <div className="flex flex-wrap gap-2">
            {builtins.map(({ p, ok }) => (
              <PatternChip key={p.id} p={p} on={selected.includes(p.id)} disabled={!ok} title={ok ? undefined : "Needs a square grid"} onToggle={() => toggle(p.id)} />
            ))}
            {customs.map(({ p, ok }) => (
              <span key={p.id} className="inline-flex items-center">
                <PatternChip p={p} on={selected.includes(p.id)} disabled={!ok} title={ok ? undefined : "Drawn for a different grid size"} onToggle={() => toggle(p.id)} />
                <button type="button" className="ms-1 text-xs text-slate-400 hover:text-red-700" aria-label={`Delete pattern ${p.name}`} onClick={() => void deleteCustom(p.id)}>
                  ✕
                </button>
              </span>
            ))}
            {!editing && (game.customPatterns?.length ?? 0) < MAX_CUSTOM_PATTERNS && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
                + Custom pattern
              </Button>
            )}
          </div>
          {editing && (
            <div className="mt-2">
              <PatternEditor rows={settings.rows} cols={settings.cols} freeIndex={freeIndex(settings)} onSave={saveCustom} onCancel={() => setEditing(false)} />
            </div>
          )}
        </fieldset>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={start} disabled={busy || chosen.length === 0 || (mode === "central" && !intervalOk)}>
            {busy ? "Starting…" : "Start round"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function PatternChip({ p, on, disabled, title, onToggle }: { p: Pattern; on: boolean; disabled: boolean; title?: string; onToggle: () => void }) {
  return (
    <label title={title} className={cn("inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-sm", on ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white", disabled && "cursor-not-allowed opacity-40")}>
      <input type="checkbox" className="sr-only" checked={on} disabled={disabled} onChange={onToggle} />
      <span dir="auto">{p.name}</span>
    </label>
  );
}
