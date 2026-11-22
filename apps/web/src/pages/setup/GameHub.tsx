import { orderBy } from "firebase/firestore";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { User } from "firebase/auth";
import type { Game, Item } from "@bingo/core";
import { Alert, Badge, FullPageSpinner, Tabs } from "../../components/ui";
import { HostHeader, LockIcon, RequireHost } from "../../components/setup/common";
import { useCollection, useDoc, useIsAdmin } from "../../lib/hooks";
import { ContentTab } from "./ContentTab";
import { SheetsTab } from "./SheetsTab";
import { RoundsTab } from "./RoundsTab";
import { SettingsTab } from "./SettingsTab";
import type { TabProps } from "./types";

const TABS = [
  { id: "content", label: "Content" },
  { id: "sheets", label: "Sheets" },
  { id: "rounds", label: "Rounds" },
  { id: "settings", label: "Settings" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function GameHub() {
  return <RequireHost>{(user) => <GameHubInner user={user} />}</RequireHost>;
}

function GameHubInner({ user }: { user: User }) {
  const { gameId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "content";
  const game = useDoc<Game>(gameId ? `games/${gameId}` : null);
  const items = useCollection<Omit<Item, "id">>(gameId ? `games/${gameId}/items` : null, [orderBy("createdAt", "asc")], gameId);

  const admin = useIsAdmin(user);

  if (game.loading || admin.loading) return <FullPageSpinner />;
  const g = game.data;
  const asAdmin = !!g && g.ownerId !== user.uid && admin.isAdmin;
  if (!g || (g.ownerId !== user.uid && !asAdmin)) {
    return (
      <div className="min-h-screen">
        <HostHeader user={user} />
        <main className="mx-auto max-w-6xl p-4">
          <Alert kind="error">{game.error ? `Could not load the game: ${game.error.message}` : "Game not found, or it isn't yours."}</Alert>
          <Link to="/games" className="mt-4 inline-block text-indigo-700 underline">
            Back to my games
          </Link>
        </main>
      </div>
    );
  }

  const props: TabProps = { gameId, game: g, user, items: items.data, itemsLoading: items.loading };
  return (
    <div className="min-h-screen">
      <HostHeader user={user}>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
          <Link to="/games" className="text-slate-500 hover:underline">
            My games
          </Link>
          <span className="text-slate-400">/</span>
          <span dir="auto" className="truncate font-semibold">
            {g.title}
          </span>
          {g.contentLocked && (
            <Badge className="gap-1 bg-amber-100 text-amber-800" title="Sheets exist; content and board shape are locked">
              <LockIcon className="size-3" /> Locked
            </Badge>
          )}
        </nav>
      </HostHeader>
      <main className="mx-auto max-w-6xl space-y-4 p-4">
        {asAdmin && (
          <Alert kind="warn">
            This game belongs to another host. You can view and change everything here as a site admin.{" "}
            <Link to="/admin" className="font-medium underline">
              Back to the admin panel
            </Link>
          </Alert>
        )}
        <Tabs
          tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
          value={tab}
          onChange={(id) =>
            setParams(
              (p) => {
                const n = new URLSearchParams(p);
                n.set("tab", id);
                return n;
              },
              { replace: true },
            )
          }
        />
        {items.error && <Alert kind="error">Could not load items: {items.error.message}</Alert>}
        <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
          {tab === "content" && <ContentTab {...props} />}
          {tab === "sheets" && <SheetsTab {...props} />}
          {tab === "rounds" && <RoundsTab {...props} />}
          {tab === "settings" && <SettingsTab key={gameId} {...props} />}
        </div>
      </main>
    </div>
  );
}
