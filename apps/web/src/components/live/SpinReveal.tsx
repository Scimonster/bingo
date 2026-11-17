import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { spinFrames, spinSchedule } from "./liveUtils";
import { cn } from "../ui";

interface Frame {
  id: string | null;
  n: number;
  final: boolean;
}

/**
 * Spinner reveal for a draw. The result is already decided (`itemId`); when `drawKey` changes
 * (e.g. the draw count) it flicks through random items from `pool`, slowing down, and lands on
 * `itemId`. The first render shows the current item without animating.
 */
export function SpinReveal({
  drawKey, itemId, pool, renderItem, placeholder, className, durationMs = 2800, frames = 16, onSettled,
}: {
  drawKey: number;
  itemId: string | null;
  pool: readonly string[];
  renderItem: (id: string) => ReactNode;
  placeholder?: ReactNode;
  className?: string;
  durationMs?: number;
  frames?: number;
  onSettled?: (itemId: string | null) => void;
}) {
  const [frame, setFrame] = useState<Frame>({ id: itemId, n: 0, final: true });
  const lastKey = useRef(drawKey);
  const counter = useRef(0);
  const settled = useRef(onSettled);
  settled.current = onSettled;

  useEffect(() => {
    if (drawKey === lastKey.current) {
      setFrame((f) => (f.id === itemId ? f : { id: itemId, n: ++counter.current, final: true }));
      return;
    }
    lastKey.current = drawKey;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seq = itemId && !reduce ? spinFrames(pool, frames, itemId) : [];
    const delays = spinSchedule(seq.length, durationMs);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    seq.forEach((id, i) => {
      timers.push(setTimeout(() => setFrame({ id, n: ++counter.current, final: false }), t));
      t += delays[i]!;
    });
    timers.push(
      setTimeout(() => {
        setFrame({ id: itemId, n: ++counter.current, final: true });
        settled.current?.(itemId);
      }, t),
    );
    return () => timers.forEach(clearTimeout);
    // pool/frames/duration changes must not restart a spin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey, itemId]);

  return (
    <div className={cn("relative overflow-hidden", className)} aria-live="polite">
      <AnimatePresence initial={false}>
        <motion.div
          key={frame.n}
          className={cn("absolute inset-0 flex items-center justify-center", !frame.final && "blur-[1px]")}
          initial={frame.final ? { y: "-40%", opacity: 0, scale: 0.6 } : { y: "-70%", opacity: 0 }}
          animate={frame.final ? { y: 0, opacity: 1, scale: 1 } : { y: 0, opacity: 0.85 }}
          exit={{ y: "70%", opacity: 0, transition: { duration: 0.12 } }}
          transition={frame.final ? { type: "spring", stiffness: 260, damping: 16 } : { duration: 0.1, ease: "linear" }}
          aria-hidden={!frame.final}
        >
          {frame.id ? renderItem(frame.id) : placeholder}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
