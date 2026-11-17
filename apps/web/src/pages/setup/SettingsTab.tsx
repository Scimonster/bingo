import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { LIMITS, type CellContent, type GameSettings, type Lang } from "@bingo/core";
import { Alert, Button, Card, Input, Label, Select, Spinner } from "../../components/ui";
import { ConfirmDialog, LockNotice } from "../../components/setup/common";
import { CellPicker } from "../../components/setup/CellPicker";
import { VarietyMeter } from "../../components/setup/VarietyMeter";
import { clampFreeSpace, syncSlotLabels } from "../../components/setup/helpers";
import { db } from "../../lib/firebase";
import { useImageUrls } from "../../lib/hooks";
import { uploadImage } from "../../lib/images";
import { deleteGame, errorMessage } from "../../lib/callables";
import { clean, type TabProps } from "./types";

const SIZES = Array.from({ length: LIMITS.gridMax - LIMITS.gridMin + 1 }, (_, i) => LIMITS.gridMin + i);

type FreeKind = "star" | "text" | "image";

export function SettingsTab({ gameId, game, user, items }: TabProps) {
  const navigate = useNavigate();
  const locked = !!game.contentLocked;
  const [title, setTitle] = useState(game.title);
  const [lang, setLang] = useState<Lang>(game.playerLanguage);
  const [s, setS] = useState<GameSettings>(game.settings);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-sync when the stored game changes (e.g. another tab) and there are no local edits.
  const stored = JSON.stringify([game.title, game.playerLanguage, game.settings]);
  const lastStored = useRef(stored);
  useEffect(() => {
    if (lastStored.current !== stored) {
      lastStored.current = stored;
      setTitle(game.title);
      setLang(game.playerLanguage);
      setS(game.settings);
    }
  }, [stored, game]);

  const dirty = JSON.stringify([title, lang, clean(s)]) !== JSON.stringify([game.title, game.playerLanguage, clean(game.settings)]);
  const freeContent = s.freeSpace.content;
  const freeKind: FreeKind = !freeContent ? "star" : freeContent.type;
  const freeUrls = useImageUrls([freeContent?.storagePath]);
  const freeIdx = s.freeSpace.row * s.cols + s.freeSpace.col;

  const setGrid = (rows: number, cols: number) =>
    setS((p) => ({ ...p, rows, cols, freeSpace: { ...p.freeSpace, ...clampFreeSpace(p.freeSpace.row, p.freeSpace.col, rows, cols) } }));
  const setFreeContent = (content: CellContent | undefined) => setS((p) => ({ ...p, freeSpace: { ...p.freeSpace, content } }));

  const save = async () => {
    const t = title.trim();
    if (!t) return setMsg({ kind: "error", text: "Title is required" });
    setBusy(true);
    setMsg(null);
    try {
      const update: Record<string, unknown> = { title: t, playerLanguage: lang, settings: clean(s) };
      if (s.boardsPerSheet !== game.settings.boardsPerSheet) {
        const pl = game.printLayout;
        const n = s.boardsPerSheet;
        update.printLayout = clean({
          ...pl,
          slotLabels: syncSlotLabels(pl.slotLabels, n),
          arrangement: n === 1 ? "single" : pl.arrangement === "single" ? "row" : pl.arrangement === "grid" && n < 3 ? "row" : pl.arrangement,
        });
      }
      await updateDoc(doc(db, "games", gameId), update);
      setMsg({ kind: "success", text: "Saved" });
    } catch (e) {
      setMsg({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const uploadFree = async (file: File) => {
    setUploading(true);
    setMsg(null);
    try {
      const storagePath = await uploadImage(user.uid, file);
      setFreeContent({ type: "image", storagePath, text: freeContent?.text });
    } catch (e) {
      setMsg({ kind: "error", text: errorMessage(e) });
    } finally {
      setUploading(false);
    }
  };

  const selectedFree = useMemo(() => new Set(s.freeSpace.enabled ? [freeIdx] : []), [s.freeSpace.enabled, freeIdx]);

  return (
    <div className="space-y-4">
      {locked && <LockNotice>Sheets exist, so grid size, free-space position and boards per sheet are locked. Reset sheets on the Sheets tab to change them. Title, language and free-space content stay editable.</LockNotice>}
      <Card className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="set-title">Title</Label>
          <Input id="set-title" dir="auto" value={title} maxLength={LIMITS.titleMax} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="set-lang">Player language</Label>
          <Select id="set-lang" className="w-full" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="he">Hebrew (right-to-left)</option>
            <option value="en">English</option>
          </Select>
          <p className="mt-1 text-xs text-slate-500">Used by the player app and the projector.</p>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Board</h2>
        <div className="flex flex-wrap gap-4">
          <div>
            <Label htmlFor="set-rows">Rows</Label>
            <Select id="set-rows" value={s.rows} disabled={locked} onChange={(e) => setGrid(Number(e.target.value), s.cols)}>
              {SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="set-cols">Columns</Label>
            <Select id="set-cols" value={s.cols} disabled={locked} onChange={(e) => setGrid(s.rows, Number(e.target.value))}>
              {SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="set-bps">Boards per sheet</Label>
            <Select id="set-bps" value={s.boardsPerSheet} disabled={locked} onChange={(e) => setS((p) => ({ ...p, boardsPerSheet: Number(e.target.value) }))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className="text-xs text-slate-500">Each board slot is one round's board (e.g. "Game 1", "Game 2"). Rename slots in the Sheets tab's layout editor.</p>
        <VarietyMeter itemCount={items.length} settings={s} />
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Free space</h2>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={s.freeSpace.enabled} disabled={locked} onChange={(e) => setS((p) => ({ ...p, freeSpace: { ...p.freeSpace, enabled: e.target.checked } }))} className="size-4" />
          <span>Free space (pre-marked, never drawn)</span>
        </label>
        {s.freeSpace.enabled && (
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Position {locked ? "" : "— click a cell"}</p>
              <CellPicker
                rows={s.rows}
                cols={s.cols}
                selected={selectedFree}
                disabled={locked}
                label="Free space position"
                onToggle={(i) => setS((p) => ({ ...p, freeSpace: { ...p.freeSpace, row: Math.floor(i / p.cols), col: i % p.cols } }))}
                marker={(_, on) => (on ? "★" : null)}
              />
            </div>
            <div className="min-w-56 flex-1 space-y-2">
              <Label htmlFor="free-kind">Content</Label>
              <Select
                id="free-kind"
                value={freeKind}
                onChange={(e) => {
                  const k = e.target.value as FreeKind;
                  if (k === "star") setFreeContent(undefined);
                  else if (k === "text") setFreeContent({ type: "text", text: freeContent?.text ?? "FREE" });
                  else setFreeContent({ type: "image", text: freeContent?.text, storagePath: freeContent?.storagePath });
                }}
              >
                <option value="star">Star (default)</option>
                <option value="text">Text</option>
                <option value="image">Image</option>
              </Select>
              {freeKind === "text" && (
                <Input dir="auto" aria-label="Free space text" value={freeContent?.text ?? ""} maxLength={LIMITS.textItemMax} onChange={(e) => setFreeContent({ type: "text", text: e.target.value })} />
              )}
              {freeKind === "image" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex size-20 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
                      {freeContent?.storagePath ? freeUrls[freeContent.storagePath] ? <img src={freeUrls[freeContent.storagePath]} alt="Free space" className="size-full object-contain" /> : <Spinner /> : <span className="text-xs text-slate-400">None</span>}
                    </div>
                    <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                      {uploading ? "Uploading…" : freeContent?.storagePath ? "Replace image" : "Upload image"}
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      hidden
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      aria-label="Free space image"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadFree(f);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <Input dir="auto" aria-label="Free space caption" placeholder="Caption (optional)" value={freeContent?.text ?? ""} maxLength={LIMITS.textItemMax} onChange={(e) => setFreeContent({ type: "image", storagePath: freeContent?.storagePath, text: e.target.value || undefined })} />
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/95 py-3">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <Button
          variant="outline"
          disabled={!dirty || busy}
          onClick={() => {
            setTitle(game.title);
            setLang(game.playerLanguage);
            setS(game.settings);
            setMsg(null);
          }}
        >
          Discard
        </Button>
        <Button onClick={save} disabled={!dirty || busy || uploading || (freeKind === "image" && !freeContent?.storagePath)}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <Card className="space-y-2 border-red-200">
        <h2 className="text-lg font-semibold text-red-800">Delete game</h2>
        <p className="text-sm text-slate-600">Deletes the game, its content, sheets and all rounds. Printed sheets stop working. This cannot be undone.</p>
        <Button variant="destructive" onClick={() => setDeleting(true)}>
          Delete game…
        </Button>
      </Card>
      {deleting && (
        <ConfirmDialog
          title="Delete this game?"
          confirmLabel="Delete forever"
          typeToConfirm={game.title}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await deleteGame(gameId);
            navigate("/games", { replace: true });
          }}
        >
          All content, sheets and rounds of <strong dir="auto">{game.title}</strong> will be permanently deleted.
        </ConfirmDialog>
      )}
    </div>
  );
}
