import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { User } from "firebase/auth";
import type { AdminGame, AdminHost, AdminResponses, AdminRound } from "@bingo/core";
import { Alert, Badge, Button, Card, FullPageSpinner, Input, Select, Spinner, Tabs, cn } from "../../components/ui";
import { ConfirmDialog, EmptyState, HostHeader, RequireHost } from "../../components/setup/common";
import { useIsAdmin } from "../../lib/hooks";
import { adminCall, deleteGame, deleteRound, errorMessage, liveRound } from "../../lib/callables";
import { formatBytes, formatWhen } from "./format";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "hosts", label: "Hosts" },
  { id: "games", label: "Games" },
  { id: "storage", label: "Storage" },
] as const;
type TabId = (typeof TABS)[number]["id"];

type Overview = AdminResponses["overview"];

export default function AdminPanel() {
  return <RequireHost>{(user) => <AdminGate user={user} />}</RequireHost>;
}

function AdminGate({ user }: { user: User }) {
  // Force a fresh token so a claim granted since sign-in takes effect without signing out.
  const { isAdmin, loading } = useIsAdmin(user, true);
  if (loading) return <FullPageSpinner />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <HostHeader user={user} />
        <main className="mx-auto max-w-6xl p-4">
          <Alert kind="error">This page is for site admins only.</Alert>
          <Link to="/games" className="mt-4 inline-block text-indigo-700 underline">
            Back to my games
          </Link>
        </main>
      </div>
    );
  }
  return <AdminInner user={user} />;
}

function AdminInner({ user }: { user: User }) {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "overview";
  const hostFilter = params.get("host") ?? "";
  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (value) n.set(key, value);
        else n.delete(key);
        return n;
      },
      { replace: true },
    );

  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminCall({ action: "overview" }));
    } catch (e) {
      setError(`Could not load the overview: ${errorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  return (
    <div className="min-h-screen">
      <HostHeader user={user}>
        <span className="font-semibold">Admin</span>
      </HostHeader>
      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Admin panel</h1>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            {data && <span>Updated {formatWhen(data.generatedAt)}</span>}
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <Tabs tabs={TABS.map((t) => ({ id: t.id, label: t.label }))} value={tab} onChange={(id) => setParam("tab", id)} />
        <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
          {tab === "storage" ? (
            <StorageTab />
          ) : !data ? (
            loading && (
              <div className="flex justify-center p-8 text-indigo-600">
                <Spinner className="size-8" />
              </div>
            )
          ) : tab === "overview" ? (
            <OverviewTab data={data} onOpenGames={() => setParam("tab", "games")} />
          ) : tab === "hosts" ? (
            <HostsTab hosts={data.hosts} onShowGames={(uid) => setParams({ tab: "games", host: uid }, { replace: true })} />
          ) : (
            <GamesTab
              games={data.games}
              hosts={data.hosts}
              hostFilter={hostFilter}
              onHostFilter={(uid) => setParam("host", uid || null)}
              onChanged={load}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- overview

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-3xl font-bold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </Card>
  );
}

function OverviewTab({ data, onOpenGames }: { data: Overview; onOpenGames: () => void }) {
  const s = data.stats;
  const active = data.games.flatMap((g) => g.rounds.filter((r) => r.status !== "ended").map((r) => ({ game: g, round: r })));
  return (
    <div className="space-y-6 pt-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Hosts" value={s.hosts} />
        <Stat label="Games" value={s.games} />
        <Stat label="Sheets generated" value={s.sheets} />
        <Stat label="Active rounds" value={s.activeRounds} hint="lobby, live or paused" />
        <Stat label="Rounds on record" value={s.rounds} hint={`${s.rounds7d} in 7 days · ${s.rounds30d} in 30 days`} />
        <Stat label="Players in ended rounds" value={s.playersInEndedRounds} hint="from round summaries" />
        <Stat label="Player entries stored" value={s.playersStored} hint="removed 30 days after a round ends" />
        <Stat label="Anonymous accounts" value={s.anonymousUsers} hint="players and displays" />
      </div>
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Active rounds</h2>
          <Button variant="ghost" size="sm" onClick={onOpenGames}>
            All games →
          </Button>
        </div>
        {active.length === 0 ? (
          <EmptyState title="No rounds are running" />
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {active.map(({ game, round }) => (
              <li key={round.sessionId} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <RoundStatus status={round.status} />
                <Link to={`/games/${game.gameId}`} className="font-medium text-indigo-700 hover:underline" dir="auto">
                  {game.title}
                </Link>
                <span className="text-sm text-slate-500">{game.ownerEmail ?? game.ownerId}</span>
                <span className="ms-auto text-sm text-slate-500">
                  {round.drawCount} draws · last activity {formatWhen(round.lastActivityAt)}
                </span>
                <Link to={`/games/${game.gameId}/rounds/${round.sessionId}`} className="text-sm font-medium text-indigo-700 hover:underline">
                  Console
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- hosts

function HostsTab({ hosts, onShowGames }: { hosts: AdminHost[]; onShowGames: (uid: string) => void }) {
  const [q, setQ] = useState("");
  const shown = hosts.filter((h) => matches(q, h.email, h.displayName, h.uid));
  return (
    <div className="space-y-3 pt-2">
      <Input placeholder="Search by email, name or uid" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" aria-label="Search hosts" />
      {shown.length === 0 ? (
        <EmptyState title="No hosts match" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-start text-slate-600">
              <tr>
                <Th>Host</Th>
                <Th>Games</Th>
                <Th>Signed up</Th>
                <Th>Last sign-in</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {shown.map((h) => (
                <tr key={h.uid}>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{h.displayName ?? h.email ?? h.uid}</span>
                      {h.isAdmin && <Badge className="bg-indigo-100 text-indigo-800">admin</Badge>}
                      {h.disabled && <Badge className="bg-red-100 text-red-800">disabled</Badge>}
                    </div>
                    {h.displayName && h.email && <div className="text-xs text-slate-500">{h.email}</div>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{h.gameCount}</td>
                  <td className="px-3 py-2 text-slate-600">{formatWhen(h.createdAt)}</td>
                  <td className="px-3 py-2 text-slate-600">{formatWhen(h.lastSignInAt)}</td>
                  <td className="px-3 py-2 text-end">
                    <Button size="sm" variant="outline" onClick={() => onShowGames(h.uid)} disabled={h.gameCount === 0}>
                      Games
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- games

type Pending =
  | { kind: "deleteGame"; game: AdminGame }
  | { kind: "endRound"; game: AdminGame; round: AdminRound }
  | { kind: "deleteRound"; game: AdminGame; round: AdminRound };

function GamesTab({
  games,
  hosts,
  hostFilter,
  onHostFilter,
  onChanged,
}: {
  games: AdminGame[];
  hosts: AdminHost[];
  hostFilter: string;
  onHostFilter: (uid: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const owners = useMemo(() => hosts.filter((h) => h.gameCount > 0), [hosts]);
  const shown = games.filter(
    (g) =>
      (!hostFilter || g.ownerId === hostFilter) &&
      (!activeOnly || g.rounds.some((r) => r.status !== "ended")) &&
      matches(q, g.title, g.ownerEmail, g.gameId),
  );

  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search by title, owner or id" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="Search games" />
        <Select value={hostFilter} onChange={(e) => onHostFilter(e.target.value)} className="max-w-xs" aria-label="Filter by host">
          <option value="">All hosts</option>
          {owners.map((h) => (
            <option key={h.uid} value={h.uid}>
              {h.email ?? h.uid}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          With active rounds
        </label>
        <span className="ms-auto text-sm text-slate-500">
          {shown.length} of {games.length}
        </span>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No games match" />
      ) : (
        <ul className="space-y-2">
          {shown.map((g) => (
            <GameRow key={g.gameId} game={g} onAction={setPending} />
          ))}
        </ul>
      )}
      {pending && <PendingDialog pending={pending} onClose={() => setPending(null)} onDone={onChanged} />}
    </div>
  );
}

function GameRow({ game: g, onAction }: { game: AdminGame; onAction: (p: Pending) => void }) {
  const active = g.rounds.filter((r) => r.status !== "ended").length;
  return (
    <li>
      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/games/${g.gameId}`} className="text-lg font-semibold text-indigo-700 hover:underline" dir="auto">
            {g.title || "(untitled)"}
          </Link>
          {g.contentLocked && <Badge className="bg-amber-100 text-amber-800">sheets generated</Badge>}
          {active > 0 && <Badge className="bg-emerald-100 text-emerald-800">{active} active</Badge>}
          <div className="ms-auto flex gap-2">
            <Link to={`/games/${g.gameId}`} className="inline-flex h-8 items-center rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700">
              Open
            </Link>
            <Button size="sm" variant="outline" className="text-red-700" onClick={() => onAction({ kind: "deleteGame", game: g })}>
              Delete
            </Button>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          {g.ownerEmail ?? <span title={g.ownerId}>deleted account</span>} · {g.itemCount} items · {g.sheetCount} sheets ·{" "}
          {g.rounds.length} rounds · created {formatWhen(g.createdAt)} · last activity {formatWhen(g.lastActivityAt)}
        </p>
        {g.rounds.length > 0 && (
          <details open={active > 0}>
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Rounds</summary>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {g.rounds.map((r) => (
                <li key={r.sessionId} className="flex flex-wrap items-center gap-2 py-1.5">
                  <RoundStatus status={r.status} />
                  <span className="text-slate-600">
                    {r.medium}, {r.mode} · {r.drawCount} draws{r.playerCount !== null ? ` · ${r.playerCount} players` : ""} · started{" "}
                    {formatWhen(r.createdAt)}
                  </span>
                  <span className="ms-auto flex gap-2">
                    <Link to={`/games/${g.gameId}/rounds/${r.sessionId}`} className="font-medium text-indigo-700 hover:underline">
                      Console
                    </Link>
                    {r.status !== "ended" ? (
                      <button className="font-medium text-red-700 hover:underline" onClick={() => onAction({ kind: "endRound", game: g, round: r })}>
                        End
                      </button>
                    ) : (
                      <button className="font-medium text-red-700 hover:underline" onClick={() => onAction({ kind: "deleteRound", game: g, round: r })}>
                        Delete
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </li>
  );
}

function PendingDialog({ pending: p, onClose, onDone }: { pending: Pending; onClose: () => void; onDone: () => Promise<void> }) {
  const run = async () => {
    if (p.kind === "deleteGame") await deleteGame(p.game.gameId);
    else if (p.kind === "endRound") await liveRound({ action: "endRound", gameId: p.game.gameId, sessionId: p.round.sessionId });
    else await deleteRound(p.game.gameId, p.round.sessionId);
    void onDone();
  };
  const owner = p.game.ownerEmail ?? "a deleted account";
  if (p.kind === "deleteGame") {
    return (
      <ConfirmDialog title="Delete game?" confirmLabel="Delete game" typeToConfirm={p.game.title} onConfirm={run} onClose={onClose}>
        <p>
          This permanently deletes <strong dir="auto">{p.game.title}</strong> (owned by {owner}) with its content, {p.game.sheetCount} sheets and{" "}
          {p.game.rounds.length} rounds. Printed sheets stop working. This cannot be undone.
        </p>
      </ConfirmDialog>
    );
  }
  if (p.kind === "endRound") {
    return (
      <ConfirmDialog title="End this round?" confirmLabel="End round" onConfirm={run} onClose={onClose}>
        <p>
          Ends the {p.round.status} round of <strong dir="auto">{p.game.title}</strong> (owned by {owner}). Players can no longer join or claim; the
          summary is kept.
        </p>
      </ConfirmDialog>
    );
  }
  return (
    <ConfirmDialog title="Delete this round?" confirmLabel="Delete round" onConfirm={run} onClose={onClose}>
      <p>
        Permanently deletes this ended round of <strong dir="auto">{p.game.title}</strong> (owned by {owner}), including its summary and winners.
      </p>
    </ConfirmDialog>
  );
}

// ---------------------------------------------------------------- storage

type Storage = AdminResponses["storage"];
type Job = "cleanupImages" | "endStaleRounds";

function StorageTab() {
  const [data, setData] = useState<Storage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [jobResult, setJobResult] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminCall({ action: "storage" }));
    } catch (e) {
      setError(`Could not load storage usage: ${errorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const runJob = async (j: Job) => {
    const r = await adminCall({ action: "runJob", job: j });
    setJobResult(
      r.job === "cleanupImages"
        ? `Image cleanup deleted ${r.deletedImageFolders} unreferenced image folders and ${r.deletedExports} old PDF exports.`
        : `Ended ${r.endedRounds} stale rounds.`,
    );
    void load();
  };

  return (
    <div className="space-y-6 pt-2">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Maintenance jobs</h2>
        <p className="text-sm text-slate-600">These also run on a schedule (stale rounds daily, image cleanup weekly).</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setJob("cleanupImages")}>
            Run image cleanup now
          </Button>
          <Button variant="outline" onClick={() => setJob("endStaleRounds")}>
            End stale rounds now
          </Button>
        </div>
        {jobResult && <Alert kind="success">{jobResult}</Alert>}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Storage usage</h2>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        {!data ? (
          loading && (
            <div className="flex justify-center p-8 text-indigo-600">
              <Spinner className="size-8" />
            </div>
          )
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Total" value={formatBytes(data.totalBytes)} />
              <Stat label="Images" value={formatBytes(data.imageBytes)} />
              <Stat label="PDF exports" value={formatBytes(data.exportBytes)} hint="deleted after 7 days" />
              <Stat label="Other" value={formatBytes(data.otherBytes)} />
            </div>
            <UsageTable
              title="Images by host"
              empty="No images uploaded"
              head={["Host", "Images", "Size"]}
              rows={data.hosts.map((h) => ({ key: h.uid, cells: [h.email ?? h.uid, h.imageFolders, formatBytes(h.imageBytes)] }))}
            />
            <UsageTable
              title="PDF exports by game"
              empty="No PDF exports stored"
              head={["Game", "Files", "Size"]}
              rows={data.exports.map((e) => ({
                key: e.gameId,
                cells: [
                  e.title !== null ? (
                    <Link to={`/games/${e.gameId}`} className="text-indigo-700 hover:underline" dir="auto">
                      {e.title}
                    </Link>
                  ) : (
                    <span className="text-slate-500">{e.gameId} (deleted)</span>
                  ),
                  e.files,
                  formatBytes(e.bytes),
                ],
              }))}
            />
          </>
        )}
      </section>

      {job === "cleanupImages" && (
        <ConfirmDialog title="Run image cleanup?" confirmLabel="Run cleanup" onConfirm={() => runJob(job)} onClose={() => setJob(null)}>
          <p>Deletes every uploaded image folder older than a day that no game item or free space uses, and PDF exports older than 7 days. Deleted images cannot be recovered.</p>
        </ConfirmDialog>
      )}
      {job === "endStaleRounds" && (
        <ConfirmDialog title="End stale rounds?" confirmLabel="End stale rounds" onConfirm={() => runJob(job)} onClose={() => setJob(null)}>
          <p>Ends every open round with no joins or draws for 24 hours.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function UsageTable({ title, empty, head, rows }: { title: string; empty: string; head: string[]; rows: { key: string; cells: ReactNode[] }[] }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {head.map((h, i) => (
                  <Th key={h} className={i > 0 ? "text-end" : undefined}>
                    {h}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((r) => (
                <tr key={r.key}>
                  {r.cells.map((c, i) => (
                    <td key={i} className={cn("px-3 py-2", i > 0 && "text-end tabular-nums")}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- bits

function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("px-3 py-2 text-start font-medium", className)}>{children}</th>;
}

const STATUS_STYLE: Record<AdminRound["status"], string> = {
  lobby: "bg-sky-100 text-sky-800",
  live: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  ended: "bg-slate-100 text-slate-600",
};

function RoundStatus({ status }: { status: AdminRound["status"] }) {
  return <Badge className={STATUS_STYLE[status]}>{status}</Badge>;
}

function matches(q: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = q.trim().toLowerCase();
  return !needle || fields.some((f) => f?.toLowerCase().includes(needle));
}
