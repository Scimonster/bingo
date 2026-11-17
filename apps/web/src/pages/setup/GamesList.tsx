import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addDoc, collection, orderBy, serverTimestamp, where } from "firebase/firestore";
import type { User } from "firebase/auth";
import { LIMITS, defaultPrintLayout, defaultSettings, type Game, type Lang } from "@bingo/core";
import { Alert, Badge, Button, Card, Dialog, Input, Label, Select, Spinner } from "../../components/ui";
import { EmptyState, HostHeader, LockIcon, RequireHost } from "../../components/setup/common";
import { toMillis } from "../../components/setup/helpers";
import { useCollection } from "../../lib/hooks";
import { db } from "../../lib/firebase";
import { cloneGame, errorMessage } from "../../lib/callables";

export default function GamesList() {
  return <RequireHost>{(user) => <GamesListInner user={user} />}</RequireHost>;
}

function GamesListInner({ user }: { user: User }) {
  const navigate = useNavigate();
  const games = useCollection<Game>("games", [where("ownerId", "==", user.uid), orderBy("createdAt", "desc")], user.uid);
  const [creating, setCreating] = useState(false);
  const [cloning, setCloning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const duplicate = async (gameId: string) => {
    setCloning(gameId);
    setError(null);
    try {
      const res = await cloneGame(gameId);
      navigate(`/games/${res.gameId}`);
    } catch (e) {
      setError(`Could not duplicate: ${errorMessage(e)}`);
    } finally {
      setCloning(null);
    }
  };

  return (
    <div className="min-h-screen">
      <HostHeader user={user} />
      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">My games</h1>
          <Button onClick={() => setCreating(true)}>New game</Button>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        {games.error && <Alert kind="error">Could not load games: {games.error.message}</Alert>}
        {games.loading ? (
          <div className="flex justify-center p-8 text-indigo-600">
            <Spinner className="size-8" />
          </div>
        ) : games.data.length === 0 && !games.error ? (
          <EmptyState title="No games yet">
            <Button className="mt-2" onClick={() => setCreating(true)}>
              Create your first game
            </Button>
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.data.map((g) => {
              const created = toMillis(g.createdAt);
              return (
                <li key={g.id}>
                  <Card className="flex h-full flex-col gap-2">
                    <Link to={`/games/${g.id}`} className="text-lg font-semibold text-indigo-700 hover:underline" dir="auto">
                      {g.title}
                    </Link>
                    <div className="flex flex-wrap gap-1 text-xs">
                      <Badge>
                        {g.settings.rows}×{g.settings.cols}
                      </Badge>
                      <Badge>{g.settings.boardsPerSheet} per sheet</Badge>
                      <Badge>{g.playerLanguage === "he" ? "Hebrew" : "English"}</Badge>
                      {g.contentLocked && (
                        <Badge className="gap-1 bg-amber-100 text-amber-800">
                          <LockIcon className="size-3" /> Sheets generated
                        </Badge>
                      )}
                    </div>
                    {created && <p className="text-xs text-slate-500">Created {new Date(created).toLocaleString()}</p>}
                    <div className="mt-auto flex gap-2 pt-2">
                      <Link to={`/games/${g.id}`} className="inline-flex h-8 items-center rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700">
                        Open
                      </Link>
                      <Button size="sm" variant="outline" onClick={() => duplicate(g.id)} disabled={cloning !== null} aria-label={`Duplicate ${g.title}`}>
                        {cloning === g.id ? "Duplicating…" : "Duplicate"}
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      {creating && <CreateGameDialog user={user} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/games/${id}`)} />}
    </div>
  );
}

function CreateGameDialog({ user, onClose, onCreated }: { user: User; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [lang, setLang] = useState<Lang>("he");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = title.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      const settings = defaultSettings();
      const ref = await addDoc(collection(db, "games"), {
        ownerId: user.uid,
        title: t,
        createdAt: serverTimestamp(),
        playerLanguage: lang,
        settings,
        printLayout: defaultPrintLayout(settings.boardsPerSheet),
      });
      onCreated(ref.id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog title="New game" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="game-title">Title</Label>
          <Input id="game-title" dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.titleMax} autoFocus required />
        </div>
        <div>
          <Label htmlFor="game-lang">Player language</Label>
          <Select id="game-lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="he">Hebrew (right-to-left)</option>
            <option value="en">English</option>
          </Select>
        </div>
        <p className="text-sm text-slate-500">Starts with a 5×5 grid, a free space in the centre and 3 boards per sheet. You can change these in Settings until sheets are generated.</p>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!t || busy}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
