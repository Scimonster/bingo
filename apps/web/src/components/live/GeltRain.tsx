import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "../ui";

/** How long a shower lasts (ms), including the latest coin's delay and fall. */
export const GELT_MS = 4200;

interface Coin {
  left: number; // % of the width
  size: number; // % of the shower's smaller side, via the CSS var below
  delay: number; // s
  fall: number; // s
  spin: number; // s per flip
  drift: number; // horizontal drift, % of own width
  tilt: number; // deg
  silver: boolean;
}

/** Deterministic pseudo-random coins (no flicker across re-renders). */
export function makeCoins(count: number, seed = 1): Coin[] {
  let x = seed >>> 0 || 1;
  const rnd = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10_000) / 10_000;
  };
  return Array.from({ length: count }, () => ({
    left: rnd() * 96,
    size: 0.7 + rnd() * 0.6,
    delay: rnd() * 1.3,
    fall: 2.1 + rnd() * 1.1,
    spin: 0.5 + rnd() * 0.7,
    drift: (rnd() - 0.5) * 240,
    tilt: (rnd() - 0.5) * 70,
    silver: rnd() < 0.22,
  }));
}

/**
 * A short shower of chocolate coins (Hanukkah gelt) over the parent (which must be positioned).
 * Pure CSS animation of inline SVGs; renders nothing when the user prefers reduced motion, and
 * removes itself once the coins have fallen.
 */
export function GeltRain({ count = 50, coinSize = "min(7vw, 10vh)", seed, className }: { count?: number; coinSize?: string; seed?: number; className?: string }) {
  const reduced = useReducedMotion();
  const coins = useMemo(() => makeCoins(count, seed ?? Math.floor(Math.random() * 2 ** 31)), [count, seed]);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const tm = setTimeout(() => setDone(true), GELT_MS);
    return () => clearTimeout(tm);
  }, []);
  if (reduced || done) return null;
  return (
    <div className={cn("gelt-rain pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      {coins.map((c, i) => (
        <div
          key={i}
          className="gelt-fall absolute top-0"
          style={{
            left: `${c.left}%`,
            width: `calc(${coinSize} * ${c.size})`,
            animationDuration: `${c.fall}s`,
            animationDelay: `${c.delay}s`,
            ["--gelt-drift" as string]: `${c.drift}%`,
            ["--gelt-tilt" as string]: `${c.tilt}deg`,
          }}
        >
          <div className="gelt-flip" style={{ animationDuration: `${c.spin}s` }}>
            <GeltCoin silver={c.silver} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A foil-wrapped chocolate coin with a crimped rim and an embossed menorah. */
export function GeltCoin({ silver = false, className }: { silver?: boolean; className?: string }) {
  const [light, mid, dark, line] = silver ? ["#f8fafc", "#cbd5e1", "#64748b", "#475569"] : ["#fff4b3", "#f5c518", "#b7791f", "#8a5a12"];
  const id = silver ? "gelt-s" : "gelt-g";
  return (
    <svg viewBox="0 0 100 100" className={cn("block h-auto w-full drop-shadow-[0_3px_4px_rgba(0,0,0,0.45)]", className)}>
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={light} />
          <stop offset="55%" stopColor={mid} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
      </defs>
      {/* crimped foil edge */}
      <circle cx="50" cy="50" r="48" fill={dark} />
      <circle cx="50" cy="50" r="46" fill={`url(#${id})`} stroke={line} strokeWidth="3" strokeDasharray="2.2 2.6" />
      <circle cx="50" cy="50" r="37" fill="none" stroke={line} strokeWidth="2" opacity="0.55" />
      {/* menorah: base, stem, four arms per side, nine flames */}
      <g fill="none" stroke={line} strokeWidth="3" strokeLinecap="round" opacity="0.8">
        <path d="M38 74 H62 M50 74 V44" />
        <path d="M26 44 C26 62 74 62 74 44 M31 44 C31 57 69 57 69 44 M36 44 C36 52 64 52 64 44 M41 44 C41 48 59 48 59 44" />
      </g>
      <g fill={line} opacity="0.8">
        {[26, 31, 36, 41, 50, 59, 64, 69, 74].map((x) => (
          <ellipse key={x} cx={x} cy={x === 50 ? 32 : 37} rx="1.8" ry="3.2" />
        ))}
      </g>
      {/* shine */}
      <ellipse cx="36" cy="28" rx="14" ry="6" fill="#fff" opacity="0.35" transform="rotate(-30 36 28)" />
    </svg>
  );
}
