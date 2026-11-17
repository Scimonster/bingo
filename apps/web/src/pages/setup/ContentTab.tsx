import { useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { addDoc, collection, deleteDoc, deleteField, doc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { LIMITS, type Item } from "@bingo/core";
import { Alert, Button, Card, Input, Label, Spinner, Textarea, cn } from "../../components/ui";
import { ConfirmDialog, EmptyState, LockNotice } from "../../components/setup/common";
import { VarietyMeter } from "../../components/setup/VarietyMeter";
import { itemKey, parsePasteMany } from "../../components/setup/helpers";
import { db } from "../../lib/firebase";
import { useImageUrls } from "../../lib/hooks";
import { uploadImage, validateImageFile } from "../../lib/images";
import { errorMessage } from "../../lib/callables";
import type { TabProps } from "./types";

export function ContentTab({ gameId, game, user, items, itemsLoading }: TabProps) {
  const locked = !!game.contentLocked;
  const textItems = items.filter((i) => i.type === "text");
  const imageItems = items.filter((i) => i.type === "image");
  return (
    <div className="space-y-4">
      {locked && <LockNotice />}
      <Card>
        <VarietyMeter itemCount={items.length} settings={game.settings} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <TextItems gameId={gameId} items={textItems} allItems={items} locked={locked} loading={itemsLoading} />
        <ImageItems gameId={gameId} uid={user.uid} items={imageItems} locked={locked} loading={itemsLoading} />
      </div>
    </div>
  );
}

function itemsCol(gameId: string) {
  return collection(db, "games", gameId, "items");
}

function TextItems({ gameId, items, allItems, locked, loading }: { gameId: string; items: Item[]; allItems: Item[]; locked: boolean; loading: boolean }) {
  const [text, setText] = useState("");
  const [paste, setPaste] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "warn"; text: string } | null>(null);
  const existing = useMemo(() => allItems.map((i) => i.text ?? "").filter(Boolean), [allItems]);
  const existingKeys = useMemo(() => new Set(existing.map(itemKey)), [existing]);
  const pasteResult = useMemo(() => (paste === null ? null : parsePasteMany(paste, existing)), [paste, existing]);

  const addOne = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim().replace(/\s+/g, " ");
    if (!t) return;
    if (existingKeys.has(itemKey(t))) {
      setMsg({ kind: "warn", text: `“${t}” is already in the list.` });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await addDoc(itemsCol(gameId), { type: "text", text: t, createdAt: serverTimestamp() });
      setText("");
    } catch (e) {
      setMsg({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const addMany = async () => {
    if (!pasteResult || !pasteResult.add.length) return;
    setBusy(true);
    setMsg(null);
    try {
      for (let i = 0; i < pasteResult.add.length; i += 400) {
        const batch = writeBatch(db);
        for (const t of pasteResult.add.slice(i, i + 400)) batch.set(doc(itemsCol(gameId)), { type: "text", text: t, createdAt: serverTimestamp() });
        await batch.commit();
      }
      const skipped = pasteResult.duplicates.length + pasteResult.tooLong.length;
      setMsg({ kind: "success", text: `Added ${pasteResult.add.length} item${pasteResult.add.length === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}.` });
      setPaste(null);
    } catch (e) {
      setMsg({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Text items ({items.length})</h2>
        {!locked && paste === null && (
          <Button size="sm" variant="outline" onClick={() => setPaste("")}>
            Paste many
          </Button>
        )}
      </div>
      {!locked && paste === null && (
        <form onSubmit={addOne} className="flex gap-2">
          <Input dir="auto" aria-label="New text item" placeholder="Add an item…" value={text} maxLength={LIMITS.textItemMax} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" disabled={!text.trim() || busy}>
            Add
          </Button>
        </form>
      )}
      {!locked && paste !== null && (
        <div className="space-y-2">
          <Label htmlFor="paste-many">One item per line</Label>
          <Textarea id="paste-many" dir="auto" rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} autoFocus />
          {pasteResult && (
            <p className="text-sm text-slate-600">
              {pasteResult.add.length} new
              {pasteResult.duplicates.length > 0 && ` · ${pasteResult.duplicates.length} duplicate${pasteResult.duplicates.length === 1 ? "" : "s"} skipped`}
              {pasteResult.tooLong.length > 0 && <span className="text-red-700"> · {pasteResult.tooLong.length} over {LIMITS.textItemMax} characters skipped</span>}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPaste(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={addMany} disabled={busy || !pasteResult?.add.length}>
              {busy ? "Adding…" : `Add ${pasteResult?.add.length ?? 0}`}
            </Button>
          </div>
        </div>
      )}
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {loading ? (
        <Spinner className="text-indigo-600" />
      ) : items.length === 0 ? (
        <EmptyState title="No text items yet">{locked ? null : "Add items one by one or paste a list."}</EmptyState>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
          {items.map((it) => (
            <TextRow key={it.id} gameId={gameId} item={it} locked={locked} existingKeys={existingKeys} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function TextRow({ gameId, item, locked, existingKeys }: { gameId: string; item: Item; locked: boolean; existingKeys: Set<string> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const t = (editing ?? "").trim().replace(/\s+/g, " ");
    if (!t || t === item.text) return setEditing(null);
    if (itemKey(t) !== itemKey(item.text ?? "") && existingKeys.has(itemKey(t))) return setError("Already in the list");
    try {
      await updateDoc(doc(db, "games", gameId, "items", item.id), { text: t });
      setEditing(null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <li className="flex items-center gap-2 px-3 py-1.5">
      {editing !== null ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input dir="auto" aria-label="Edit item" className="h-8" value={editing} maxLength={LIMITS.textItemMax} onChange={(e) => setEditing(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Escape" && setEditing(null)} />
          <Button size="sm" type="submit">
            Save
          </Button>
        </form>
      ) : (
        <span dir="auto" className="flex-1 break-words">
          {item.text}
        </span>
      )}
      {error && <span className="text-xs text-red-700">{error}</span>}
      {!locked && editing === null && (
        <>
          <Button size="sm" variant="ghost" onClick={() => setEditing(item.text ?? "")} aria-label={`Edit ${item.text}`}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="text-red-700" onClick={() => void deleteDoc(doc(db, "games", gameId, "items", item.id)).catch((e) => setError(errorMessage(e)))} aria-label={`Delete ${item.text}`}>
            Delete
          </Button>
        </>
      )}
    </li>
  );
}

interface UploadJob {
  key: string;
  name: string;
  status: "uploading" | "error";
  error?: string;
}

function ImageItems({ gameId, uid, items, locked, loading }: { gameId: string; uid: string; items: Item[]; locked: boolean; loading: boolean }) {
  const urls = useImageUrls(items.map((i) => i.storagePath));
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [drag, setDrag] = useState(false);
  const [toDelete, setToDelete] = useState<Item | null>(null);

  const upload = async (files: FileList | File[]) => {
    const list = [...files];
    const fresh: UploadJob[] = list.map((f, i) => {
      const err = validateImageFile(f);
      return { key: `${Date.now()}-${i}-${f.name}`, name: f.name, status: err ? "error" : "uploading", error: err ?? undefined };
    });
    setJobs((j) => [...j.filter((x) => x.status === "uploading"), ...fresh]);
    await Promise.all(
      list.map(async (file, i) => {
        const job = fresh[i]!;
        if (job.status === "error") return;
        try {
          const storagePath = await uploadImage(uid, file);
          await addDoc(itemsCol(gameId), { type: "image", storagePath, createdAt: serverTimestamp() });
          setJobs((j) => j.filter((x) => x.key !== job.key));
        } catch (e) {
          setJobs((j) => j.map((x) => (x.key === job.key ? { ...x, status: "error", error: `${file.name}: ${errorMessage(e)}` } : x)));
        }
      }),
    );
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (!locked && e.dataTransfer.files.length) void upload(e.dataTransfer.files);
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Images ({items.length})</h2>
        {!locked && (
          <>
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
              Upload images
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              aria-label="Upload images"
              onChange={(e) => {
                if (e.target.files?.length) void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
      {!locked && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={cn("rounded-lg border-2 border-dashed p-4 text-center text-sm text-slate-500", drag ? "border-indigo-500 bg-indigo-50" : "border-slate-300")}
        >
          Drop images here · PNG, JPEG, WebP or GIF up to 10 MB
        </div>
      )}
      {jobs.length > 0 && (
        <ul className="space-y-1 text-sm">
          {jobs.map((j) => (
            <li key={j.key} className="flex items-center gap-2">
              {j.status === "uploading" ? (
                <>
                  <Spinner className="size-4 text-indigo-600" /> Uploading {j.name}…
                </>
              ) : (
                <Alert kind="error" className="flex-1">
                  {j.error}{" "}
                  <button className="underline" onClick={() => setJobs((x) => x.filter((y) => y.key !== j.key))}>
                    Dismiss
                  </button>
                </Alert>
              )}
            </li>
          ))}
        </ul>
      )}
      {loading ? (
        <Spinner className="text-indigo-600" />
      ) : items.length === 0 ? (
        <EmptyState title="No images yet" />
      ) : (
        <ul className="grid max-h-[32rem] grid-cols-3 gap-2 overflow-auto sm:grid-cols-4">
          {items.map((it) => (
            <ImageTile key={it.id} gameId={gameId} item={it} url={it.storagePath ? urls[it.storagePath] : undefined} locked={locked} onDelete={() => setToDelete(it)} />
          ))}
        </ul>
      )}
      {toDelete && (
        <ConfirmDialog title="Delete image?" confirmLabel="Delete" onClose={() => setToDelete(null)} onConfirm={() => deleteDoc(doc(db, "games", gameId, "items", toDelete.id))}>
          This removes the image{toDelete.text ? ` “${toDelete.text}”` : ""} from the game.
        </ConfirmDialog>
      )}
    </Card>
  );
}

function ImageTile({ gameId, item, url, locked, onDelete }: { gameId: string; item: Item; url?: string; locked: boolean; onDelete: () => void }) {
  const [caption, setCaption] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const t = (caption ?? "").trim();
    try {
      await updateDoc(doc(db, "games", gameId, "items", item.id), t ? { text: t } : { text: deleteField() });
      setCaption(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <li className="group relative flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex aspect-square items-center justify-center">
        {url ? <img src={url} alt={item.text ?? "Image item"} className="h-full w-full object-contain" loading="lazy" /> : <Spinner className="text-slate-400" />}
      </div>
      {caption !== null ? (
        <form
          className="flex gap-1 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input dir="auto" className="h-7 px-1 text-xs" aria-label="Caption" value={caption} maxLength={LIMITS.textItemMax} onChange={(e) => setCaption(e.target.value)} autoFocus onBlur={() => void save()} onKeyDown={(e) => e.key === "Escape" && setCaption(null)} />
        </form>
      ) : (
        <p dir="auto" className="truncate px-1 py-0.5 text-center text-xs text-slate-600" title={item.text}>
          {item.text || (locked ? "" : <span className="text-slate-400">No caption</span>)}
        </p>
      )}
      {error && <p className="px-1 text-xs text-red-700">{error}</p>}
      {!locked && caption === null && (
        <div className="absolute inset-x-0 top-0 flex justify-end gap-1 p-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => setCaption(item.text ?? "")}>
            Caption
          </Button>
          <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={onDelete} aria-label={`Delete image ${item.text ?? ""}`}>
            Delete
          </Button>
        </div>
      )}
    </li>
  );
}
