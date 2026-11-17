/**
 * Minimal shadcn/ui-style primitives (Tailwind, no runtime deps). Extend here rather than
 * duplicating styles in pages.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Variant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg" | "xl";
const variants: Record<Variant, string> = {
  default: "bg-indigo-600 text-white hover:bg-indigo-700",
  secondary: "bg-slate-200 text-slate-900 hover:bg-slate-300",
  outline: "border border-slate-300 bg-white hover:bg-slate-100",
  ghost: "hover:bg-slate-100",
  destructive: "bg-red-600 text-white hover:bg-red-700",
};
const sizes: Record<Size, string> = { sm: "h-8 px-3 text-sm", md: "h-10 px-4", lg: "h-12 px-6 text-lg", xl: "h-16 px-8 text-2xl" };

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  ({ className, variant = "default", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-indigo-500", variants[variant], sizes[size], className)}
      {...props}
    />
  ),
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-10 w-full rounded-lg border border-slate-300 bg-white px-3 focus:outline-2 focus:outline-indigo-500", className)} {...props} />
));

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("w-full rounded-lg border border-slate-300 bg-white p-3 focus:outline-2 focus:outline-indigo-500", className)} {...props} />
));

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn("h-10 rounded-lg border border-slate-300 bg-white px-2", className)} {...props} />
));

export function Label({ children, className, ...props }: HTMLAttributes<HTMLLabelElement> & { htmlFor?: string }) {
  return (
    <label className={cn("mb-1 block text-sm font-medium text-slate-700", className)} {...props}>
      {children}
    </label>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-slate-200 bg-white p-4 shadow-sm", className)} {...props} />;
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700", className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent", className)} aria-label="Loading" />;
}

export function Alert({ kind = "info", children, className }: { kind?: "info" | "warn" | "error" | "success"; children: ReactNode; className?: string }) {
  const k = { info: "bg-sky-50 text-sky-900 border-sky-200", warn: "bg-amber-50 text-amber-900 border-amber-200", error: "bg-red-50 text-red-900 border-red-200", success: "bg-emerald-50 text-emerald-900 border-emerald-200" }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("rounded-lg border px-3 py-2 text-sm", k, className)}>
      {children}
    </div>
  );
}

/** Modal dialog. Render conditionally; closes on backdrop click / Escape. */
export function Dialog({ title, onClose, children, className }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cn("max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6 shadow-xl", className)}>
        <h2 className="mb-4 text-xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cn("-mb-px border-b-2 px-4 py-2 font-medium", value === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-indigo-600">
      <Spinner className="size-10" />
    </div>
  );
}
