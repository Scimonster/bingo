import { useEffect, useState } from "react";
import { onAuthStateChanged, onIdTokenChanged, type User } from "firebase/auth";
import { collection, doc, onSnapshot, query, type QueryConstraint } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { auth, db, storage } from "./firebase";

export function useAuth(): { user: User | null; loading: boolean } {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({ user: auth.currentUser, loading: !auth.currentUser });
  useEffect(() => onAuthStateChanged(auth, (user) => setState({ user, loading: false })), []);
  return state;
}

// Last known admin flag per uid, so pages don't flash a spinner on every mount.
const adminCache = new Map<string, boolean>();

/**
 * Whether the signed-in user is a site admin (custom claim `admin: true`, never for anonymous
 * users). `refresh` forces a new ID token, picking up a claim granted since sign-in.
 */
export function useIsAdmin(user: User | null | undefined, refresh = false): { isAdmin: boolean; loading: boolean } {
  const uid = user && !user.isAnonymous ? user.uid : null;
  const cached = uid ? adminCache.get(uid) : false;
  const [state, setState] = useState<{ uid: string | null; isAdmin: boolean }>({
    uid: cached === undefined ? null : uid,
    isAdmin: cached ?? false,
  });
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const check = (u: User | null) => {
      if (!u || u.uid !== uid) return;
      void u
        .getIdTokenResult(refresh)
        .then((r) => {
          const isAdmin = r.claims.admin === true;
          adminCache.set(uid, isAdmin);
          if (alive) setState({ uid, isAdmin });
        })
        .catch(() => alive && setState({ uid, isAdmin: false }));
    };
    check(auth.currentUser);
    const unsub = onIdTokenChanged(auth, check);
    return () => {
      alive = false;
      unsub();
    };
  }, [uid, refresh]);
  if (!uid) return { isAdmin: false, loading: false };
  if (state.uid === uid) return { isAdmin: state.isAdmin, loading: false };
  return { isAdmin: cached ?? false, loading: cached === undefined };
}

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/** Live document by path segments; null path = skip. Data includes `id`. */
export function useDoc<T>(path: string | null): Live<(T & { id: string }) | null> {
  const [s, set] = useState<Live<(T & { id: string }) | null>>({ data: null, loading: !!path, error: null });
  useEffect(() => {
    if (!path) {
      set({ data: null, loading: false, error: null });
      return;
    }
    set((p) => ({ ...p, loading: true }));
    return onSnapshot(
      doc(db, path),
      (snap) => set({ data: snap.exists() ? ({ id: snap.id, ...(snap.data() as T) }) : null, loading: false, error: null }),
      (error) => set({ data: null, loading: false, error }),
    );
  }, [path]);
  return s;
}

/** Live collection; null path = skip. Pass a stable `key` when constraints change. */
export function useCollection<T>(path: string | null, constraints: QueryConstraint[] = [], key = ""): Live<(T & { id: string })[]> {
  const [s, set] = useState<Live<(T & { id: string })[]>>({ data: [], loading: !!path, error: null });
  useEffect(() => {
    if (!path) {
      set({ data: [], loading: false, error: null });
      return;
    }
    set((p) => ({ ...p, loading: true }));
    return onSnapshot(
      query(collection(db, path), ...constraints),
      (snap) => set({ data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })), loading: false, error: null }),
      (error) => set({ data: [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  return s;
}

const urlCache = new Map<string, Promise<string>>();
/** Download URL for an image folder (users/{uid}/images/{id}) and variant. */
export function imageUrl(storagePath: string, variant: "thumb" | "print" = "thumb"): Promise<string> {
  const key = `${storagePath}/${variant}.webp`;
  let p = urlCache.get(key);
  if (!p) {
    p = getDownloadURL(ref(storage, key));
    urlCache.set(key, p);
  }
  return p;
}

/** Resolves many image folders to URLs; returns a map that fills in as they load. */
export function useImageUrls(paths: (string | undefined)[], variant: "thumb" | "print" = "thumb"): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = [...new Set(paths.filter(Boolean))].sort().join("|");
  useEffect(() => {
    let alive = true;
    for (const p of key ? key.split("|") : []) {
      imageUrl(p, variant)
        .then((u) => alive && setUrls((m) => (m[p] === u ? m : { ...m, [p]: u })))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [key, variant]);
  return urls;
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
