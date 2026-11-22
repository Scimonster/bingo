import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { FullPageSpinner } from "./components/ui";

// Setup area (host, before play): landing, games list, game hub.
const Landing = lazy(() => import("./pages/setup/Landing"));
const GamesList = lazy(() => import("./pages/setup/GamesList"));
const GameHub = lazy(() => import("./pages/setup/GameHub"));
// Site admin panel.
const AdminPanel = lazy(() => import("./pages/admin/AdminPanel"));
// Live area: host console.
const HostConsole = lazy(() => import("./pages/live/HostConsole"));
// Player app.
const Join = lazy(() => import("./pages/play/Join"));
const Play = lazy(() => import("./pages/play/Play"));
const SheetLanding = lazy(() => import("./pages/play/SheetLanding"));
// Projector.
const Projector = lazy(() => import("./pages/present/Projector"));
const DisplayRedeem = lazy(() => import("./pages/present/DisplayRedeem"));

export function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/games" element={<GamesList />} />
        <Route path="/games/:gameId" element={<GameHub />} />
        <Route path="/games/:gameId/rounds/:sessionId" element={<HostConsole />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/present/:gameId/:sessionId" element={<Projector />} />
        <Route path="/display/:token" element={<DisplayRedeem />} />
        <Route path="/join" element={<Join />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/play/:gameId/:sessionId" element={<Play />} />
        <Route path="/s/:gameId/:serial" element={<SheetLanding />} />
        <Route path="*" element={<p className="p-8">Not found</p>} />
      </Routes>
    </Suspense>
  );
}
