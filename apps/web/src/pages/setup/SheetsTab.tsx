import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, orderBy, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { useQuery } from "@tanstack/react-query";
import {
  GenerationError, LIMITS, formatSerial, generateSheets as generateLocal, sanitizeInfoText, seededRng, sheetQrPath,
  type Board, type PrintLayout, type Sheet,
} from "@bingo/core";
import { SheetLayout, type SheetLayoutProps } from "@bingo/sheet";
import { Alert, Button, Card, Input, Label, Spinner, cn } from "../../components/ui";
import { ConfirmDialog, EmptyState } from "../../components/setup/common";
import { FullSizePreview, PrintPortal, ScaledSheet, SetupSheetCss, useBackgroundUrl, useQrSvg, useSheetResolver } from "../../components/setup/SheetPreview";
import { parseSerialRange, syncSlotLabels } from "../../components/setup/helpers";
import { useCollection } from "../../lib/hooks";
import { db, storage } from "../../lib/firebase";
import { errorMessage, exportSheetsPdf, generateSheets, resetSheets } from "../../lib/callables";
import { PrintLayoutEditor } from "./PrintLayoutEditor";
import { clean, type TabProps } from "./types";

type SheetDoc = Sheet & { id: string };
const SAMPLE_COUNT = 3;
const PAGE_SIZE = 60;

const AUTOSAVE_MS = 800;

function normalizeLayout(l: PrintLayout, n: number): PrintLayout {
  return { ...l, slotLabels: syncSlotLabels(l.slotLabels, n) };
}

/** The form of a draft layout that is written to Firestore. */
function toStored(draft: PrintLayout): PrintLayout {
  return clean({
    ...draft,
    heading: draft.heading?.trim() ?? "",
    slotLabels: draft.slotLabels.map((s) => s.trim()),
    infoText: sanitizeInfoText(draft.infoText, LIMITS.infoTextMax),
  });
}

/** JSON with sorted object keys, so layouts compare equal whatever order Firestore returns fields in. */
function stableKey(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x,
  );
}

export function SheetsTab(props: TabProps) {
  const { gameId, game } = props;
  const sheets = useCollection<Sheet>(`games/${gameId}/sheets`, [orderBy("serial", "asc")], gameId);
  const n = game.settings.boardsPerSheet;
  const stored = useMemo(() => normalizeLayout(game.printLayout, n), [game.printLayout, n]);
  const [draft, setDraft] = useState<PrintLayout>(stored);
  const storedKey = stableKey(stored);
  const draftKey = stableKey(toStored(draft));
  const dirty = draftKey !== storedKey;
  const ownKeys = useRef(new Set<string>()).current;
  const draftKeyRef = useRef(draftKey);
  draftKeyRef.current = draftKey;
  // Adopt layouts changed elsewhere (another tab, a settings change). Our own saves come back as
  // keys we wrote, so the draft — possibly with untrimmed text mid-typing — is left alone.
  useEffect(() => {
    if (storedKey !== draftKeyRef.current && !ownKeys.has(storedKey)) setDraft(JSON.parse(storedKey) as PrintLayout);
  }, [storedKey, ownKeys]);
  const saveState = useLayoutAutoSave(gameId, draft, draftKey, dirty, ownKeys);
  const [view, setView] = useState<"samples" | "sheets">("samples");
  const hasSheets = sheets.data.length > 0;
  useEffect(() => {
    if (!sheets.loading) setView(hasSheets ? "sheets" : "samples");
  }, [hasSheets, sheets.loading]);

  return (
    <div className="space-y-4">
      <SetupSheetCss />
      <GeneratePanel {...props} sheets={sheets.data} loading={sheets.loading} />
      {sheets.error && <Alert kind="error">Could not load sheets: {sheets.error.message}</Alert>}
      <div className="grid gap-4 lg:grid-cols-[minmax(20rem,26rem)_1fr]">
        <Card className="space-y-3 self-start">
          <h2 className="text-lg font-semibold">Print layout</h2>
          <PrintLayoutEditor layout={draft} settings={game.settings} uid={props.user.uid} onChange={setDraft} />
          <SaveStatus state={saveState.state} dirty={dirty} onRetry={saveState.retry} />
        </Card>
        <Card className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" className="flex rounded-lg bg-slate-100 p-1 text-sm">
              {(["samples", "sheets"] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("rounded-md px-3 py-1", view === v ? "bg-white font-medium shadow-sm" : "text-slate-600")}>
                  {v === "samples" ? "Samples" : `Sheets (${sheets.data.length})`}
                </button>
              ))}
            </div>
          </div>
          {view === "samples" ? <Samples {...props} layout={draft} /> : <Browse {...props} layout={draft} sheets={sheets.data} loading={sheets.loading} />}
        </Card>
      </div>
      {hasSheets && <ExportPanel gameId={gameId} sheets={sheets.data} />}
    </div>
  );
}

type SaveState = { kind: "idle" | "saving" | "saved" } | { kind: "error"; text: string };

/**
 * Saves the draft layout a moment after the last edit, and right away when the tab unmounts.
 * Only the latest save reports its outcome; a failed save waits for the next edit or a retry.
 */
function useLayoutAutoSave(gameId: string, draft: PrintLayout, draftKey: string, dirty: boolean, ownKeys: Set<string>) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const latest = useRef({ draft, dirty });
  latest.current = { draft, dirty };
  const seq = useRef(0);
  const save = useCallback(async () => {
    if (!latest.current.dirty) return;
    const layout = toStored(latest.current.draft);
    ownKeys.add(stableKey(layout));
    const mine = ++seq.current;
    setState({ kind: "saving" });
    try {
      await updateDoc(doc(db, "games", gameId), { printLayout: layout });
      if (mine === seq.current) setState({ kind: "saved" });
    } catch (e) {
      if (mine === seq.current) setState({ kind: "error", text: errorMessage(e) });
    }
  }, [gameId, ownKeys]);
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [draftKey, dirty, save]);
  useEffect(() => () => void save(), [save]);
  const pending = dirty || state.kind === "saving";
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  return { state, retry: () => void save() };
}

function SaveStatus({ state, dirty, onRetry }: { state: SaveState; dirty: boolean; onRetry: () => void }) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 text-xs" aria-live="polite">
      {state.kind === "error" ? (
        <>
          <Alert kind="error" className="me-auto">
            Couldn't save the layout: {state.text}
          </Alert>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </>
      ) : dirty || state.kind === "saving" ? (
        <span className="text-slate-500">Saving…</span>
      ) : state.kind === "saved" ? (
        <span className="text-emerald-700">All changes saved</span>
      ) : (
        <span className="text-slate-500">Changes save automatically</span>
      )}
    </div>
  );
}

function GeneratePanel({ gameId, game, items, sheets, loading }: TabProps & { sheets: SheetDoc[]; loading: boolean }) {
  const [count, setCount] = useState("30");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const has = sheets.length > 0;
  const remaining = LIMITS.sheetsPerGameMax - sheets.length;
  const max = Math.min(LIMITS.generateMaxPerCall, remaining);
  const c = Number(count);
  const valid = Number.isInteger(c) && c >= 1 && c <= max;
  const last = sheets[sheets.length - 1]?.serial ?? 0;

  const generate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await generateSheets(gameId, c);
      setMsg({ kind: "success", text: `Created ${r.created} sheet${r.created === 1 ? "" : "s"} (№ ${formatSerial(r.firstSerial)}–${formatSerial(r.lastSerial)}).` });
    } catch (e) {
      setMsg({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-wrap items-end gap-4">
      <div className="min-w-48 flex-1">
        <h2 className="text-lg font-semibold">Sheets</h2>
        <p className="text-sm text-slate-600">
          {loading ? "Loading…" : has ? `${sheets.length} sheets (№ ${formatSerial(sheets[0]!.serial)}–${formatSerial(last)}), ${game.settings.boardsPerSheet} board${game.settings.boardsPerSheet === 1 ? "" : "s"} each.` : "No sheets yet. Check the samples, then generate. Content and board shape lock once sheets exist."}
        </p>
      </div>
      <div>
        <Label htmlFor="gen-count">{has ? "Add more sheets" : "Number of sheets"}</Label>
        <div className="flex gap-2">
          <Input id="gen-count" type="number" min={1} max={max} className="w-28" value={count} onChange={(e) => setCount(e.target.value)} aria-invalid={!valid} />
          <Button onClick={generate} disabled={!valid || busy || items.length === 0}>
            {busy ? (
              <>
                <Spinner className="size-4" /> Generating…
              </>
            ) : has ? (
              "Add"
            ) : (
              "Generate"
            )}
          </Button>
        </div>
      </div>
      {has && (
        <Button variant="outline" className="text-red-700" onClick={() => setResetting(true)}>
          Reset sheets…
        </Button>
      )}
      {msg && <Alert kind={msg.kind} className="w-full">{msg.text}</Alert>}
      {resetting && (
        <ConfirmDialog
          title="Reset all sheets?"
          confirmLabel="Delete all sheets"
          onClose={() => setResetting(false)}
          onConfirm={async () => {
            const r = await resetSheets(gameId);
            setMsg({ kind: "success", text: `Deleted ${r.deleted} sheets. Content is unlocked.` });
          }}
        >
          <p>
            All {sheets.length} sheets will be deleted and content unlocked. <strong>Printed sheets become invalid</strong> — their serials and QR codes will no longer match any board.
          </p>
        </ConfirmDialog>
      )}
    </Card>
  );
}

function Samples({ game, items, layout }: TabProps & { layout: PrintLayout }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [idx, setIdx] = useState(0);
  const resolve = useSheetResolver(game, items);
  const qr = useQrSvg("SAMPLE");
  const backgroundUrl = useBackgroundUrl(layout);
  const [full, setFull] = useState(false);
  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const result = useMemo(() => {
    try {
      return { sheets: generateLocal({ itemIds, settings: game.settings, count: SAMPLE_COUNT, rng: seededRng(seed), maxAttempts: 300 }) };
    } catch (e) {
      return { error: e instanceof GenerationError ? e.message : String(e) };
    }
  }, [itemIds, game.settings, seed]);

  if ("error" in result) {
    return (
      <EmptyState title="Can't build sample sheets yet">
        {result.error}. Add content on the Content tab.
      </EmptyState>
    );
  }
  const sheet = result.sheets[Math.min(idx, result.sheets.length - 1)]!;
  const p: SheetLayoutProps = { serial: 0, boards: sheet.boards.map((b) => b.cells), settings: game.settings, printLayout: layout, lang: game.playerLanguage, resolve, qrSvg: qr, backgroundUrl };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-600">Random samples from your current content — not stored, no serial.</p>
        <div className="ms-auto flex items-center gap-1">
          {result.sheets.map((_, i) => (
            <Button key={i} size="sm" variant={i === idx ? "secondary" : "ghost"} onClick={() => setIdx(i)} aria-label={`Sample ${i + 1}`} aria-pressed={i === idx}>
              {i + 1}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setSeed((s) => (s * 1103515245 + 12345) >>> 1)}>
            Reshuffle
          </Button>
          <Button size="sm" variant="outline" onClick={() => setFull(true)}>
            Full size
          </Button>
        </div>
      </div>
      <div className="rounded-lg bg-slate-100 p-3">
        <ScaledSheet props={p} sample maxHeightPx={720} />
      </div>
      {full && <FullSizePreview props={p} sample onClose={() => setFull(false)} />}
    </div>
  );
}

function useBoards(gameId: string, sheet: SheetDoc | undefined) {
  return useQuery({
    queryKey: ["boards", gameId, sheet?.id, sheet?.boardIds.join(",")],
    enabled: !!sheet,
    staleTime: Infinity,
    queryFn: async () => {
      const docs = await Promise.all(sheet!.boardIds.map((id) => getDoc(doc(db, "games", gameId, "boards", id))));
      return docs.map((d) => {
        if (!d.exists()) throw new Error(`Board ${d.id} is missing`);
        return (d.data() as Board).cells;
      });
    },
  });
}

function Browse({ gameId, game, items, layout, sheets, loading }: TabProps & { layout: PrintLayout; sheets: SheetDoc[]; loading: boolean }) {
  const [sel, setSel] = useState(0);
  const [page, setPage] = useState(0);
  const [jump, setJump] = useState("");
  const [printing, setPrinting] = useState(false);
  const i = Math.min(sel, Math.max(0, sheets.length - 1));
  const sheet = sheets[i];
  const boards = useBoards(gameId, sheet);
  const resolve = useSheetResolver(game, items);
  const printResolve = useSheetResolver(game, items, "print");
  const backgroundUrl = useBackgroundUrl(layout);
  const [full, setFull] = useState(false);
  const qr = useQrSvg(sheet ? `${location.origin}${sheetQrPath(gameId, sheet.serial)}` : "");
  const pages = Math.ceil(sheets.length / PAGE_SIZE);

  if (loading) return <Spinner className="text-indigo-600" />;
  if (!sheets.length) return <EmptyState title="No sheets generated yet">Use Generate above. Until then, the Samples view shows how sheets will look.</EmptyState>;

  const select = (k: number) => {
    const c = Math.max(0, Math.min(sheets.length - 1, k));
    setSel(c);
    setPage(Math.floor(c / PAGE_SIZE));
  };
  const p: SheetLayoutProps | null = sheet && boards.data ? { serial: sheet.serial, boards: boards.data, settings: game.settings, printLayout: layout, lang: game.playerLanguage, resolve, qrSvg: qr, backgroundUrl } : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => select(i - 1)} disabled={i === 0} aria-label="Previous sheet">
          ‹
        </Button>
        <span className="min-w-24 text-center font-mono font-semibold">№ {sheet && formatSerial(sheet.serial)}</span>
        <Button size="sm" variant="outline" onClick={() => select(i + 1)} disabled={i >= sheets.length - 1} aria-label="Next sheet">
          ›
        </Button>
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const k = sheets.findIndex((s) => s.serial === Number(jump));
            if (k >= 0) select(k);
            setJump("");
          }}
        >
          <Input className="h-8 w-20" inputMode="numeric" aria-label="Go to serial" placeholder="Serial" value={jump} onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))} />
          <Button size="sm" variant="ghost" type="submit">
            Go
          </Button>
        </form>
        <Button size="sm" variant="outline" className="ms-auto" disabled={!p} onClick={() => setFull(true)}>
          Full size
        </Button>
        <Button size="sm" disabled={!p} onClick={() => setPrinting(true)}>
          Print this sheet
        </Button>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_9rem]">
        <div className="rounded-lg bg-slate-100 p-3">
          {boards.error ? <Alert kind="error">{errorMessage(boards.error)}</Alert> : p ? <ScaledSheet props={p} maxHeightPx={720} /> : <Spinner className="text-indigo-600" />}
        </div>
        <div className="space-y-2">
          <ul className="grid max-h-[40rem] grid-cols-5 gap-1 overflow-auto text-sm xl:grid-cols-2" aria-label="Sheets">
            {sheets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((s, k) => {
              const idx = page * PAGE_SIZE + k;
              return (
                <li key={s.id}>
                  <button onClick={() => select(idx)} aria-current={idx === i} className={cn("w-full rounded px-1 py-0.5 font-mono", idx === i ? "bg-indigo-600 text-white" : "hover:bg-slate-100")}>
                    {formatSerial(s.serial)}
                  </button>
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <div className="flex items-center justify-between text-xs">
              <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
                ‹
              </Button>
              {page + 1}/{pages}
              <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page">
                ›
              </Button>
            </div>
          )}
        </div>
      </div>
      {full && p && <FullSizePreview props={p} onClose={() => setFull(false)} />}
      {printing && p && (
        <PrintPortal onDone={() => setPrinting(false)}>
          <SheetLayout {...p} resolve={printResolve} />
        </PrintPortal>
      )}
    </div>
  );
}

function ExportPanel({ gameId, sheets }: { gameId: string; sheets: SheetDoc[] }) {
  const first = sheets[0]?.serial ?? 1;
  const last = sheets[sheets.length - 1]?.serial ?? 1;
  const [from, setFrom] = useState(String(first));
  const [to, setTo] = useState(String(last));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; pages: number; name: string } | null>(null);
  const range = parseSerialRange(from, to, last);

  const exportPdf = async () => {
    if (!range) return;
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const r = await exportSheetsPdf(gameId, range.from, range.to);
      const url = await getDownloadURL(storageRef(storage, r.storagePath));
      setLink({ url, pages: r.pages, name: `sheets-${formatSerial(range.from)}-${formatSerial(range.to)}.pdf` });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1">
        <h2 className="text-lg font-semibold">Export PDF</h2>
        <p className="text-sm text-slate-600">One sheet per page, using the saved print layout. Links expire after 7 days.</p>
      </div>
      <div>
        <Label htmlFor="exp-from">From №</Label>
        <Input id="exp-from" type="number" min={1} max={last} className="w-24" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="exp-to">To №</Label>
        <Input id="exp-to" type="number" min={1} max={last} className="w-24" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Button onClick={exportPdf} disabled={!range || busy}>
        {busy ? (
          <>
            <Spinner className="size-4" /> Rendering…
          </>
        ) : (
          "Export PDF"
        )}
      </Button>
      {!range && <p className="w-full text-sm text-red-700">Enter a range between 1 and {last}.</p>}
      {error && <Alert kind="error" className="w-full">{error}</Alert>}
      {link && (
        <Alert kind="success" className="w-full">
          PDF ready ({link.pages} pages).{" "}
          <a href={link.url} target="_blank" rel="noopener noreferrer" download={link.name} className="font-medium underline">
            Download
          </a>
        </Alert>
      )}
    </Card>
  );
}
