/** Game content loading shared by the host console, player app and projector. */
import { useMemo } from "react";
import { ItemCell, makeResolver, type Resolve } from "@bingo/sheet";
import { boardId, type Board, type Game, type Item } from "@bingo/core";
import { useCollection, useDoc, useImageUrls } from "../../lib/hooks";
import { cn } from "../ui";

export type ItemDoc = Omit<Item, "id"> & { id: string };

/** Live game doc + items + a cell resolver (thumb images). */
export function useGameContent(gameId: string | null | undefined, enabled = true) {
  const g = enabled && gameId ? gameId : null;
  const game = useDoc<Game>(g ? `games/${g}` : null);
  const items = useCollection<Omit<Item, "id">>(g ? `games/${g}/items` : null);
  const paths = [
    ...items.data.map((i) => (i.type === "image" ? i.storagePath : undefined)),
    game.data?.settings.freeSpace.content?.type === "image" ? game.data.settings.freeSpace.content.storagePath : undefined,
  ];
  const urls = useImageUrls(paths, "thumb");
  const itemMap = useMemo(() => Object.fromEntries(items.data.map((i) => [i.id, i])) as Record<string, ItemDoc>, [items.data]);
  const freeContent = game.data?.settings.freeSpace.content;
  const resolve: Resolve = useMemo(() => makeResolver(itemMap, freeContent, (p) => urls[p]), [itemMap, freeContent, urls]);
  return { game, items, itemMap, resolve, loading: game.loading || items.loading };
}

/** Live board doc for a sheet serial (zero-padded or number) and slot. */
export function useBoard(gameId: string | null | undefined, serial: string | number | null | undefined, slot: number | null | undefined) {
  const path = gameId && serial != null && slot != null ? `games/${gameId}/boards/${boardId(Number(serial), slot)}` : null;
  return useDoc<Board>(path);
}

/** One item shown in a square box (text auto-fits to the box). */
export function ItemTile({ itemId, resolve, className }: { itemId: string; resolve: Resolve; className?: string }) {
  return (
    <div className={cn("relative flex aspect-square items-center justify-center overflow-hidden p-[7%] text-center font-semibold leading-tight", className)} style={{ containerType: "inline-size" }}>
      <ItemCell view={resolve(itemId)} variant="screen" />
    </div>
  );
}
