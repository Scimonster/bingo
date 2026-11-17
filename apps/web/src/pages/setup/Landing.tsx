import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { normalizeJoinCode } from "@bingo/core";
import { Alert, Button, Card, Input, Label, Spinner } from "../../components/ui";
import { useAuth } from "../../lib/hooks";
import { isHost, signInWithGoogle, signOut } from "../../lib/auth";
import { errorMessage } from "../../lib/callables";

export default function Landing() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = normalizeJoinCode(code);
    if (c) navigate(`/join/${encodeURIComponent(c)}`);
  };

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      navigate("/games");
    } catch (e) {
      const msg = errorMessage(e);
      if (!/popup-closed|cancelled-popup/.test(msg)) setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-indigo-50 to-slate-50 p-4">
      <h1 className="text-5xl font-black text-indigo-700">Bingo</h1>
      <Card className="w-full max-w-sm">
        <form onSubmit={join} className="space-y-3">
          <Label htmlFor="join-code">Join a game · הצטרפות למשחק</Label>
          <Input
            id="join-code"
            value={code}
            onChange={(e) => setCode(normalizeJoinCode(e.target.value))}
            placeholder="ABC234"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={16}
            className="h-14 text-center font-mono text-2xl tracking-widest"
          />
          <Button type="submit" size="lg" className="w-full" disabled={!code}>
            Join
          </Button>
        </form>
      </Card>
      <Card className="w-full max-w-sm space-y-3 text-center">
        <p className="text-sm text-slate-600">Hosting a game?</p>
        {loading ? (
          <Spinner className="text-indigo-600" />
        ) : isHost(user) ? (
          <>
            <Link to="/games" className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 px-4 font-medium text-white hover:bg-indigo-700">
              My games
            </Link>
            <p className="text-xs text-slate-500">
              Signed in as {user.displayName ?? user.email} ·{" "}
              <button className="underline" onClick={() => void signOut()}>
                sign out
              </button>
            </p>
          </>
        ) : (
          <Button variant="outline" className="w-full" onClick={signIn} disabled={busy}>
            <GoogleIcon />
            {busy ? "Signing in…" : "Sign in with Google"}
          </Button>
        )}
        {error && <Alert kind="error">{error}</Alert>}
      </Card>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
