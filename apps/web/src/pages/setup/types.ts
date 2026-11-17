import type { User } from "firebase/auth";
import type { Game, Item } from "@bingo/core";

export type GameDoc = Game & { id: string };

export interface TabProps {
  gameId: string;
  game: GameDoc;
  user: User;
  items: Item[];
  itemsLoading: boolean;
}

/** Drops undefined values (Firestore rejects them) from a plain object tree. */
export function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = clean(x);
    return out as T;
  }
  return v;
}
