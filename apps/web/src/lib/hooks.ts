import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, doc, onSnapshot, query, type QueryConstraint } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { auth, db, storage } from "./firebase";

export function useAuth(): { user: User | null; loading: boolean } {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({ user: auth.currentUser, loading: !auth.currentUser });
  useEffect(() => onAuthStateChanged(auth, (user) => setState({ user, loading: false })), []);
  return state;
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
