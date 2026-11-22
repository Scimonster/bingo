import { useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import type { User } from "firebase/auth";
import { Alert, Button, Dialog, FullPageSpinner, Input, Label } from "../ui";
import { useAuth, useIsAdmin } from "../../lib/hooks";
import { isHost, signOut } from "../../lib/auth";
import { errorMessage } from "../../lib/callables";

/** Renders children only for a signed-in, non-anonymous host; otherwise redirects to the landing page. */
export function RequireHost({ children }: { children: (user: User) => ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!isHost(user)) return <Navigate to="/" replace />;
  return <>{children(user)}</>;
}

export function HostHeader({ user, children }: { user: User; children?: ReactNode }) {
  const { isAdmin } = useIsAdmin(user);
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/games" className="text-lg font-black text-indigo-700">
          Bingo
        </Link>
        <div className="min-w-0 flex-1">{children}</div>
        {isAdmin && (
          <Link to="/admin" className="rounded-md px-2 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
            Admin
          </Link>
        )}
        <span className="hidden text-sm text-slate-500 sm:inline" title={user.email ?? undefined}>
          {user.displayName ?? user.email}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </header>
  );
}

/** Confirm dialog for destructive actions; optional typed confirmation. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel = "Confirm",
  destructive = true,
  typeToConfirm,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  typeToConfirm?: string;
  onConfirm: () => Promise<unknown> | unknown;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = !typeToConfirm || typed.trim() === typeToConfirm.trim();
  return (
    <Dialog title={title} onClose={() => !busy && onClose()}>
      <div className="space-y-4">
        <div className="text-slate-700">{children}</div>
        {typeToConfirm !== undefined && (
          <div>
            <Label htmlFor="confirm-type">
              Type <strong dir="auto">{typeToConfirm}</strong> to confirm
            </Label>
            <Input id="confirm-type" dir="auto" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        )}
        {error && <Alert kind="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!ok || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                setError(errorMessage(e));
                setBusy(false);
              }
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="mt-2 text-sm">{children}</div>}
    </div>
  );
}

export function LockNotice({ children }: { children?: ReactNode }) {
  return (
    <Alert kind="info" className="flex items-start gap-2">
      <LockIcon className="mt-0.5 size-4 shrink-0" />
      <span>{children ?? "Sheets exist, so content and board shape are locked. Reset sheets on the Sheets tab to edit them (printed sheets become invalid)."}</span>
    </Alert>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
