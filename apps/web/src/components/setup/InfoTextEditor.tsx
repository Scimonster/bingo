import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, Extension, Node, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type Editor, type ReactNodeViewProps } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { INFO_COLORS, LIMITS, type InfoColor, type InfoImageSize, type InfoSize } from "@bingo/core";
import { useImageUrls } from "../../lib/hooks";
import { uploadImage } from "../../lib/images";
import { errorMessage } from "../../lib/callables";
import { Alert, Spinner, cn } from "../ui";
import { IMAGE_NODE, docToMarkup, markupToDoc, sizeCss, type PMNode } from "./infoDoc";

const COLOR_LABELS: Record<InfoColor, string> = { red: "Red", orange: "Orange", green: "Green", blue: "Blue", purple: "Purple", gray: "Grey" };
const SIZE_OPTIONS: { id: InfoSize | ""; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "", label: "Normal" },
  { id: "large", label: "Large" },
  { id: "xl", label: "Extra large" },
];
const IMAGE_SIZES: { id: InfoImageSize; label: string }[] = [
  { id: "s", label: "S" },
  { id: "m", label: "M" },
  { id: "l", label: "L" },
];

function InfoImageView({ node, selected, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const path = node.attrs.path as string;
  const size = node.attrs.size as InfoImageSize;
  const urls = useImageUrls([path]);
  const align = (node.attrs.textAlign as string | null) ?? "center";
  return (
    <NodeViewWrapper className="info-editor-img" data-drag-handle="" style={{ textAlign: align }}>
      <span className={cn("relative inline-block rounded", selected && "outline-2 outline-offset-2 outline-indigo-500")}>
        {urls[path] ? (
          <img src={urls[path]} alt="" draggable={false} className={`info-editor-img--${size}`} />
        ) : (
          <span className="inline-flex size-16 items-center justify-center bg-slate-100">
            <Spinner className="size-4" />
          </span>
        )}
        {selected && (
          <span className="absolute -top-3 start-1/2 flex -translate-x-1/2 gap-0.5 rounded-md bg-slate-900 p-0.5 text-xs text-white shadow rtl:translate-x-1/2" contentEditable={false}>
            {IMAGE_SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={size === s.id}
                title={`Image size ${s.label}`}
                className={cn("rounded px-1.5", size === s.id ? "bg-white text-slate-900" : "hover:bg-slate-700")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateAttributes({ size: s.id })}
              >
                {s.label}
              </button>
            ))}
            <button type="button" title="Remove image" aria-label="Remove image" className="rounded px-1.5 hover:bg-slate-700" onMouseDown={(e) => e.preventDefault()} onClick={() => deleteNode()}>
              ✕
            </button>
          </span>
        )}
      </span>
    </NodeViewWrapper>
  );
}

/** An uploaded image on its own line: { path: users/{uid}/images/{id}, size: s|m|l }. */
const InfoImage = Node.create({
  name: IMAGE_NODE,
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      path: { default: null, parseHTML: (el) => el.getAttribute("data-path"), renderHTML: (a) => ({ "data-path": a.path }) },
      size: { default: "m", parseHTML: (el) => el.getAttribute("data-size") ?? "m", renderHTML: (a) => ({ "data-size": a.size }) },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-info-image]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-info-image": "", ...HTMLAttributes }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(InfoImageView);
  },
});

/** Rejects edits whose stored markup would exceed the limit (like a textarea's maxLength). */
const MaxLength = Extension.create<{ max: number }>({
  name: "infoMaxLength",
  addOptions() {
    return { max: LIMITS.infoTextMax };
  },
  addProseMirrorPlugins() {
    const max = this.options.max;
    return [
      new Plugin({
        filterTransaction: (tr, state) => {
          if (!tr.docChanged) return true;
          const next = docToMarkup(tr.doc.toJSON() as PMNode).length;
          return next <= max || next <= docToMarkup(state.doc.toJSON() as PMNode).length;
        },
      }),
    ];
  },
});

function ToolButton({ label, active, onClick, children, className, disabled }: { label: string; active?: boolean; onClick: () => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40",
        active && "bg-indigo-100 text-indigo-800 hover:bg-indigo-100",
        className,
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-6 w-px self-center bg-slate-200" aria-hidden="true" />;

function AlignIcon({ kind }: { kind: "start" | "center" | "end" }) {
  const lines = kind === "start" ? [[3, 17], [3, 13], [3, 17], [3, 11]] : kind === "center" ? [[3, 17], [6, 14], [3, 17], [7, 13]] : [[3, 17], [7, 17], [3, 17], [9, 17]];
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
      {lines.map(([x1, x2], i) => (
        <line key={i} x1={x1} x2={x2} y1={4 + i * 4} y2={4 + i * 4} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ))}
    </svg>
  );
}

function Toolbar({ editor, uid, onUploadError }: { editor: Editor; uid: string; onUploadError: (e: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const ts = e.getAttributes("textStyle") as { color?: string | null; fontSize?: string | null };
      return {
        block: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : "p",
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        ul: e.isActive("bulletList"),
        ol: e.isActive("orderedList"),
        color: (ts.color ?? "").toLowerCase(),
        size: SIZE_OPTIONS.find((o) => o.id && ts.fontSize === sizeCss(o.id))?.id ?? "",
        align: e.isActive({ textAlign: "center" }) ? "center" : e.isActive({ textAlign: "end" }) ? "end" : "start",
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });
  const chain = () => editor.chain().focus();
  /** After a dropdown change, give the caret back to the editor so typing continues there. */
  const refocus = () => setTimeout(() => editor.view.focus(), 0);
  const insertImage = async (file: File) => {
    setUploading(true);
    onUploadError(null);
    try {
      const path = await uploadImage(uid, file);
      chain().insertContent({ type: IMAGE_NODE, attrs: { path, size: "m" } }).run();
    } catch (e) {
      onUploadError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 p-1" role="toolbar" aria-label="Formatting">
      <select
        aria-label="Text style"
        className="h-8 rounded-md border border-slate-200 bg-white px-1 text-sm"
        value={s.block}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") chain().setParagraph().run();
          else chain().setHeading({ level: v === "h1" ? 1 : 2 }).run();
          refocus();
        }}
      >
        <option value="p">Normal text</option>
        <option value="h1">Title</option>
        <option value="h2">Subtitle</option>
      </select>
      <select
        aria-label="Text size"
        className="h-8 rounded-md border border-slate-200 bg-white px-1 text-sm"
        value={s.size}
        onChange={(e) => {
          const v = e.target.value as InfoSize | "";
          if (v) chain().setFontSize(sizeCss(v)).run();
          else chain().unsetFontSize().run();
          refocus();
        }}
      >
        {SIZE_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <Sep />
      <ToolButton label="Bold (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()} className="font-bold">
        B
      </ToolButton>
      <ToolButton label="Italic (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()} className="italic">
        I
      </ToolButton>
      <ToolButton label="Underline (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()} className="underline">
        U
      </ToolButton>
      <Sep />
      <div className="flex items-center gap-0.5" role="group" aria-label="Text colour">
        <ToolButton label="Default colour" active={!s.color} onClick={() => chain().unsetColor().run()}>
          <span className="size-4 rounded-full border border-slate-400 bg-[linear-gradient(135deg,#fff_45%,#ef4444_45%,#ef4444_55%,#fff_55%)]" />
        </ToolButton>
        {(Object.keys(INFO_COLORS) as InfoColor[]).map((c) => (
          <ToolButton key={c} label={COLOR_LABELS[c]} active={s.color === INFO_COLORS[c]} onClick={() => chain().setColor(INFO_COLORS[c]).run()}>
            <span className="size-4 rounded-full" style={{ background: INFO_COLORS[c] }} />
          </ToolButton>
        ))}
      </div>
      <Sep />
      {(["start", "center", "end"] as const).map((a) => (
        <ToolButton key={a} label={a === "start" ? "Align to start" : a === "center" ? "Centre" : "Align to end"} active={s.align === a} onClick={() => chain().setTextAlign(a).run()}>
          <AlignIcon kind={a} />
        </ToolButton>
      ))}
      <Sep />
      <ToolButton label="Bulleted list" active={s.ul} onClick={() => chain().toggleBulletList().run()}>
        • ≡
      </ToolButton>
      <ToolButton label="Numbered list" active={s.ol} onClick={() => chain().toggleOrderedList().run()}>
        1.≡
      </ToolButton>
      <Sep />
      <ToolButton label="Insert image" disabled={uploading} onClick={() => fileRef.current?.click()}>
        {uploading ? <Spinner className="size-4" /> : "🖼 Image"}
      </ToolButton>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label="Info image"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void insertImage(f);
          e.target.value = "";
        }}
      />
      <Sep />
      <ToolButton label="Undo (Ctrl+Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        ↶
      </ToolButton>
      <ToolButton label="Redo (Ctrl+Shift+Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        ↷
      </ToolButton>
    </div>
  );
}

/**
 * WYSIWYG editor for the info text. Emits the stored markup (see `@bingo/core` markdown.ts);
 * only formatting the format supports is offered, so the preview and print match the editor.
 */
export function InfoTextEditor({ value, onChange, id, uid }: { value: string; onChange: (v: string) => void; id: string; uid: string }) {
  const last = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [uploadError, setUploadError] = useState<string | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: false,
      }),
      TextStyle,
      Color,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph", IMAGE_NODE], alignments: ["start", "center", "end"], defaultAlignment: null }),
      InfoImage,
      MaxLength,
    ],
    textDirection: "auto",
    content: markupToDoc(value),
    editorProps: {
      attributes: { id, class: "bs-md info-editor min-h-28 px-3 py-2 focus:outline-none", "aria-label": "Info text", role: "textbox", "aria-multiline": "true" },
    },
    onUpdate: ({ editor: e }) => {
      const md = docToMarkup(e.getJSON() as PMNode);
      if (md === last.current) return;
      last.current = md;
      onChangeRef.current(md);
    },
  });
  // Outside changes (reset, another tab's save): reload the document.
  useEffect(() => {
    if (!editor || value === last.current) return;
    last.current = value;
    editor.commands.setContent(markupToDoc(value), { emitUpdate: false });
  }, [editor, value]);
  const used = value.length / LIMITS.infoTextMax;
  return (
    <div className="rounded-lg border border-slate-300 bg-white focus-within:outline-2 focus-within:outline-indigo-500">
      {editor && <Toolbar editor={editor} uid={uid} onUploadError={setUploadError} />}
      <EditorContent editor={editor} />
      {used > 0.8 && (
        <p className={cn("px-3 pb-1 text-end text-xs", used >= 1 ? "text-red-700" : "text-slate-500")} aria-live="polite">
          {used >= 1 ? "The info text is full." : `${Math.round(used * 100)}% of the info text space used.`}
        </p>
      )}
      {uploadError && (
        <Alert kind="error" className="m-2">
          {uploadError}
        </Alert>
      )}
    </div>
  );
}
