import { useRef } from "react";
import { LIMITS } from "@bingo/core";
import { Button, Textarea, cn } from "../ui";

type Edit = { value: string; selStart: number; selEnd: number };

/** Wraps the selection in a marker (e.g. ** for bold); toggles it off when already wrapped. */
export function wrapSelection(value: string, start: number, end: number, marker: string): Edit {
  const sel = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return { value: before.slice(0, -marker.length) + sel + after.slice(marker.length), selStart: start - marker.length, selEnd: end - marker.length };
  }
  const text = sel || "text";
  return { value: before + marker + text + marker + after, selStart: start + marker.length, selEnd: start + marker.length + text.length };
}

/** Prefixes every line touched by the selection with a list marker (or removes it). */
export function toggleListLines(value: string, start: number, end: number, kind: "ul" | "ol"): Edit {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = value.indexOf("\n", Math.max(end - (end > start && value[end - 1] === "\n" ? 1 : 0), start));
  if (lineEnd < 0) lineEnd = value.length;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const re = kind === "ul" ? /^\s*[-*•]\s+/ : /^\s*\d+[.)]\s+/;
  const allHave = lines.every((l) => re.test(l));
  const next = lines.map((l, i) => (allHave ? l.replace(re, "") : `${kind === "ul" ? "- " : `${i + 1}. `}${l.replace(/^\s*([-*•]|\d+[.)])\s+/, "")}`)).join("\n");
  const v = value.slice(0, lineStart) + next + value.slice(lineEnd);
  return { value: v, selStart: lineStart, selEnd: lineStart + next.length };
}

export function InfoTextEditor({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const apply = (fn: (v: string, s: number, e: number) => Edit) => {
    const el = ref.current;
    if (!el) return;
    const r = fn(value, el.selectionStart, el.selectionEnd);
    onChange(r.value.slice(0, LIMITS.infoTextMax));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.selStart, r.selEnd);
    });
  };
  const over = value.length > LIMITS.infoTextMax;
  return (
    <div className="rounded-lg border border-slate-300 bg-white focus-within:outline-2 focus-within:outline-indigo-500">
      <div className="flex gap-1 border-b border-slate-200 p-1" role="toolbar" aria-label="Formatting">
        <Button type="button" size="sm" variant="ghost" className="font-bold" aria-label="Bold" title="Bold (Ctrl+B)" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, "**"))}>
          B
        </Button>
        <Button type="button" size="sm" variant="ghost" className="italic" aria-label="Italic" title="Italic (Ctrl+I)" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, "*"))}>
          I
        </Button>
        <Button type="button" size="sm" variant="ghost" aria-label="Bulleted list" title="Bulleted list" onClick={() => apply((v, s, e) => toggleListLines(v, s, e, "ul"))}>
          • List
        </Button>
        <Button type="button" size="sm" variant="ghost" aria-label="Numbered list" title="Numbered list" onClick={() => apply((v, s, e) => toggleListLines(v, s, e, "ol"))}>
          1. List
        </Button>
        <span className={cn("ms-auto self-center pe-2 text-xs", over ? "text-red-700" : "text-slate-500")} aria-live="polite">
          {value.length}/{LIMITS.infoTextMax}
        </span>
      </div>
      <Textarea
        id={id}
        ref={ref}
        dir="auto"
        rows={5}
        className="rounded-none border-0 focus:outline-none"
        value={value}
        maxLength={LIMITS.infoTextMax}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (!(e.ctrlKey || e.metaKey)) return;
          if (e.key === "b") {
            e.preventDefault();
            apply((v, s, en) => wrapSelection(v, s, en, "**"));
          } else if (e.key === "i") {
            e.preventDefault();
            apply((v, s, en) => wrapSelection(v, s, en, "*"));
          }
        }}
      />
    </div>
  );
}
