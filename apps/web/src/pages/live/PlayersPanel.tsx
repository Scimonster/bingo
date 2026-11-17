import { useState } from "react";
import { Link } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { LIMITS } from "@bingo/core";
import { db } from "../../lib/firebase";
import { liveRound } from "../../lib/callables";
import { Alert, Badge, Button, Card, Dialog, Input, Label, Select } from "../../components/ui";
import { useAction } from "../../components/live/useAction";
import type { PlayerDoc, SessionDoc } from "./HostConsole";

type Modal = { kind: "rename" | "move" | "remove"; player: PlayerDoc } | null;

export function PlayersPanel({ gameId, sessionId, session: s, players }: { gameId: string; sessionId: string; session: SessionDoc; players: PlayerDoc[] }) {
  const [modal, setModal] = useState<Modal>(null);
  const waiting = players.filter((p) => p.waitingForSheets > 0);
  const waitingCount = Math.max(s.waitingCount ?? 0, waiting.length);
  const ended = s.status === "ended";

  return (
    <Card>
      <h2 className="mb-2 text-lg font-bold">Players <span className="text-sm font-normal text-slate-500">({players.length})</span></h2>
      {s.medium === "digital" && waitingCount > 0 && (
        <Alert kind="warn" className="mb-3">
          {waitingCount === 1 ? "1 player is" : `${waitingCount} players are`} waiting for sheets.{" "}
          <Link to={`/games/${gameId}?tab=sheets`} target="_blank" className="font-semibold underline">Generate more sheets ↗</Link>
          <span className="block text-xs">New sheets are handed to waiting players automatically.</span>
        </Alert>
      )}
      {players.length === 0 ? (
        <p className="text-sm text-slate-500">Nobody has joined yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {players.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
              <span className="min-w-0 max-w-full truncate font-semibold" dir="auto">{p.name}</span>
              <span className="flex flex-wrap gap-1">
                {p.sheets.map((serial) => (
                  <Badge key={serial} className="font-mono">№ {serial}</Badge>
                ))}
                {p.waitingForSheets > 0 && <Badge className="bg-amber-100 text-amber-900">waiting for {p.waitingForSheets}</Badge>}
                {p.sheets.length === 0 && p.waitingForSheets === 0 && <Badge className="bg-slate-50 text-slate-400">no sheet</Badge>}
              </span>
              {!ended && (
                <span className="ms-auto flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setModal({ kind: "rename", player: p })}>Rename</Button>
                  <Button size="sm" variant="ghost" onClick={() => setModal({ kind: "move", player: p })} disabled={players.length < 2} title="Move sheets from another (old) entry of this player">Move sheets from…</Button>
                  <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setModal({ kind: "remove", player: p })}>Remove</Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {modal?.kind === "rename" && <RenameDialog path={`games/${gameId}/sessions/${sessionId}/players/${modal.player.id}`} player={modal.player} onClose={() => setModal(null)} />}
      {modal?.kind === "move" && <MoveDialog gameId={gameId} sessionId={sessionId} to={modal.player} players={players} onClose={() => setModal(null)} />}
      {modal?.kind === "remove" && <RemoveDialog gameId={gameId} sessionId={sessionId} player={modal.player} onClose={() => setModal(null)} />}
    </Card>
  );
}

function RenameDialog({ path, player, onClose }: { path: string; player: PlayerDoc; onClose: () => void }) {
  const { busy, error, run } = useAction();
  const [name, setName] = useState(player.name);
  const trimmed = name.trim();
  const valid = trimmed.length >= LIMITS.playerNameMin && trimmed.length <= LIMITS.playerNameMax;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const ok = await run("rename", async () => {
      await updateDoc(doc(db, path), { name: trimmed });
      return true;
    });
    if (ok) onClose();
  };
  return (
    <Dialog title="Rename player" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Input dir="auto" autoFocus value={name} maxLength={LIMITS.playerNameMax} onChange={(e) => setName(e.target.value)} />
        {error && <Alert kind="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!valid || busy === "rename"}>Save</Button>
        </div>
      </form>
    </Dialog>
  );
}

function MoveDialog({ gameId, sessionId, to, players, onClose }: { gameId: string; sessionId: string; to: PlayerDoc; players: PlayerDoc[]; onClose: () => void }) {
  const { busy, error, run } = useAction();
  const others = players.filter((p) => p.id !== to.id);
  const [from, setFrom] = useState(others.find((p) => p.sheets.length > 0)?.id ?? others[0]?.id ?? "");
  const fromPlayer = others.find((p) => p.id === from);
  const move = async () => {
    if (!from) return;
    const r = await run("move", () => liveRound({ action: "reassignPlayer", gameId, sessionId, fromUid: from, toUid: to.id }));
    if (r) onClose();
  };
  return (
    <Dialog title={`Move sheets to ${to.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        Use this when a player switched devices: they joined again with the new device, and their old entry still holds the sheets. Sheets, marks and claims move to <b dir="auto">{to.name}</b> and the old entry is removed.
      </p>
      <Label htmlFor="move-from">Old entry</Label>
      <Select id="move-from" className="w-full" value={from} onChange={(e) => setFrom(e.target.value)}>
        {others.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} {p.sheets.length ? `(№ ${p.sheets.join(", ")})` : "(no sheets)"}
          </option>
        ))}
      </Select>
      {fromPlayer && fromPlayer.sheets.length === 0 && <p className="mt-2 text-sm text-amber-700">That entry holds no sheets.</p>}
      {error && <Alert kind="error" className="mt-3">{error}</Alert>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={move} disabled={!from || busy === "move"}>Move sheets</Button>
      </div>
    </Dialog>
  );
}

function RemoveDialog({ gameId, sessionId, player, onClose }: { gameId: string; sessionId: string; player: PlayerDoc; onClose: () => void }) {
  const { busy, error, run } = useAction();
  const remove = async () => {
    const r = await run("remove", () => liveRound({ action: "removePlayer", gameId, sessionId, uid: player.id }));
    if (r) onClose();
  };
  return (
    <Dialog title="Remove player?" onClose={onClose}>
      <p className="mb-3 text-slate-700">
        <b dir="auto">{player.name}</b> leaves the round{player.sheets.length ? ` and sheet${player.sheets.length > 1 ? "s" : ""} № ${player.sheets.join(", ")} become free again` : ""}.
      </p>
      {error && <Alert kind="error" className="mb-3">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="destructive" onClick={remove} disabled={busy === "remove"}>Remove</Button>
      </div>
    </Dialog>
  );
}
