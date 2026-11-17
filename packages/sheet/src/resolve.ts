import { FREE, type CellContent } from "@bingo/core";

/** What a single board cell shows. */
export type CellView =
  | { kind: "text"; text: string }
  | { kind: "image"; url?: string; caption?: string }
  | { kind: "free"; text?: string; url?: string }; // url and text absent → star

/** Maps a board cell ID (an item ID or FREE) to what it shows. */
export type Resolve = (cellId: string) => CellView;

export interface ResolverItem {
  type: "text" | "image";
  text?: string;
  storagePath?: string;
}

/**
 * Builds a resolver from the game's items and free-space content. `urlFor` turns an image
 * folder (`users/{uid}/images/{imageId}`) into a displayable URL (download URL, data URL…);
 * returning undefined renders an empty image placeholder (e.g. while loading).
 */
export function makeResolver(
  items: Record<string, ResolverItem>,
  freeContent: CellContent | undefined,
  urlFor: (storagePath: string) => string | undefined,
): Resolve {
  const cache = new Map<string, CellView>();
  const build = (cellId: string): CellView => {
    if (cellId === FREE) {
      if (!freeContent) return { kind: "free" };
      const text = freeContent.text?.trim() || undefined;
      if (freeContent.type === "image" && freeContent.storagePath) {
        return { kind: "free", url: urlFor(freeContent.storagePath), text };
      }
      return { kind: "free", text };
    }
    const item = items[cellId];
    if (!item) return { kind: "text", text: "" };
    if (item.type === "image") {
      const caption = item.text?.trim() || undefined;
      return { kind: "image", url: item.storagePath ? urlFor(item.storagePath) : undefined, caption };
    }
    return { kind: "text", text: item.text ?? "" };
  };
  return (cellId) => {
    let v = cache.get(cellId);
    if (!v) {
      v = build(cellId);
      cache.set(cellId, v);
    }
    return v;
  };
}

/** Accessible name of a cell. */
export function cellLabel(view: CellView, freeLabel = "Free space"): string {
  switch (view.kind) {
    case "text":
      return view.text;
    case "image":
      return view.caption ?? "Image";
    case "free":
      return view.text ? `${freeLabel}: ${view.text}` : freeLabel;
  }
}
