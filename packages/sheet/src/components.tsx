import { parseInfoText, type Inline } from "@bingo/core";
import type { CSSProperties, ReactNode } from "react";
import { sheetCss } from "./css";
import { fitFontSize } from "./fit";
import { cellLabel, type CellView, type Resolve } from "./resolve";

export type Variant = "screen" | "print";

/**
 * Injects `sheetCss`. React 19 hoists and de-duplicates `<style href precedence>`, so rendering
 * it in several places is fine.
 */
export function SheetStyles() {
  return (
    <style href="bingo-sheet-css" precedence="default">
      {sheetCss}
    </style>
  );
}

function Star({ small }: { small?: boolean }) {
  return (
    <svg className={small ? "bs-star bs-star--small" : "bs-star"} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 1.8l2.95 6.6 7.2.75-5.4 4.85 1.53 7.08L12 17.43l-6.28 3.65 1.53-7.08-5.4-4.85 7.2-.75z"
      />
    </svg>
  );
}

function Img({ url }: { url?: string }) {
  return url ? (
    <img className="bs-cell-img" src={url} alt="" draggable={false} />
  ) : (
    <span className="bs-cell-img bs-cell-img--empty" />
  );
}

/** Content of one cell (no wrapper): fitted text, image with caption, or the free space. */
export function ItemCell({ view, variant = "screen" }: { view: CellView; variant?: Variant }) {
  void variant; // sizing is relative to the cell in both variants
  switch (view.kind) {
    case "text":
      return (
        <span className="bs-cell-text" dir="auto" style={{ fontSize: fitFontSize(view.text) }}>
          {view.text}
        </span>
      );
    case "image":
      return (
        <span className="bs-cell-media">
          <Img url={view.url} />
          {view.caption ? (
            <span className="bs-cell-caption" dir="auto" style={{ fontSize: fitFontSize(view.caption, 0.3) }}>
              {view.caption}
            </span>
          ) : null}
        </span>
      );
    case "free":
      if (view.url !== undefined) {
        return (
          <span className="bs-cell-media">
            <Img url={view.url} />
            {view.text ? (
              <span className="bs-cell-caption" dir="auto" style={{ fontSize: fitFontSize(view.text, 0.3) }}>
                {view.text}
              </span>
            ) : null}
          </span>
        );
      }
      if (view.text) {
        return (
          <span className="bs-cell-media">
            <Star small />
            <span className="bs-cell-caption" dir="auto" style={{ fontSize: fitFontSize(view.text, 0.55) }}>
              {view.text}
            </span>
          </span>
        );
      }
      return <Star />;
  }
}

export interface BoardGridProps {
  /** Flattened rows × cols cell IDs (item IDs or FREE). */
  cells: readonly string[];
  rows: number;
  cols: number;
  resolve: Resolve;
  variant?: Variant;
  marked?: ReadonlySet<number>;
  highlighted?: ReadonlySet<number>;
  /** When set, cells render as buttons (tap targets) with aria-pressed = marked. */
  onCellClick?: (index: number) => void;
  /** Accessible name of the board (e.g. the slot label). */
  label?: string;
  className?: string;
  /** Accessible name of the free space (default "Free space"). */
  freeLabel?: string;
}

/**
 * A board. Always laid out LTR so cell indices map to the same positions in every language;
 * text inside cells uses dir="auto". The print variant fills its container (size it in mm).
 */
export function BoardGrid({
  cells,
  rows,
  cols,
  resolve,
  variant = "screen",
  marked,
  highlighted,
  onCellClick,
  label,
  className,
  freeLabel,
}: BoardGridProps) {
  const style: CSSProperties = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  };
  const cls = ["bs-board", `bs-board--${variant}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={style} dir="ltr" role="group" aria-label={label}>
      {cells.slice(0, rows * cols).map((id, i) => {
        const view = resolve(id);
        const isMarked = marked?.has(i) ?? false;
        const cellCls = [
          "bs-cell",
          `bs-cell--${view.kind}`,
          isMarked && "bs-cell--marked",
          highlighted?.has(i) && "bs-cell--hl",
        ]
          .filter(Boolean)
          .join(" ");
        const name = cellLabel(view, freeLabel);
        const content = <ItemCell view={view} variant={variant} />;
        if (onCellClick) {
          return (
            <button
              key={i}
              type="button"
              className={cellCls}
              aria-label={name}
              aria-pressed={isMarked}
              data-index={i}
              onClick={() => onCellClick(i)}
            >
              {content}
            </button>
          );
        }
        return (
          <div key={i} className={cellCls} role="img" aria-label={name} data-index={i}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return n.v;
      case "br":
        return <br key={i} />;
      case "b":
        return <b key={i}>{renderInline(n.c)}</b>;
      case "i":
        return <i key={i}>{renderInline(n.c)}</i>;
    }
  });
}

/** Renders the info-text Markdown subset (parsed to an AST; never raw HTML). */
export function InfoText({ md, className, style }: { md: string; className?: string; style?: CSSProperties }) {
  const blocks = parseInfoText(md);
  if (!blocks.length) return null;
  return (
    <div className={["bs-md", className].filter(Boolean).join(" ")} style={style}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p":
            return <p key={i} dir="auto">{renderInline(b.c)}</p>;
          case "ul":
            return (
              <ul key={i} dir="auto">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} dir="auto">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ol>
            );
        }
      })}
    </div>
  );
}
