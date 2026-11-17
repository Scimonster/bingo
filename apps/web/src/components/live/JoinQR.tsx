import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "../ui";

/** Full join URL for a code. */
export function joinUrl(code: string): string {
  return `${location.origin}/join/${code}`;
}

/** QR code (inline SVG) for any text; defaults to black on white for reliable scanning. */
export function JoinQR({ text, className, dark = "#000000", light = "#ffffff" }: { text: string; className?: string; dark?: string; light?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark, light } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(""));
    return () => {
      alive = false;
    };
  }, [text, dark, light]);
  return <div className={cn("[&>svg]:block [&>svg]:h-full [&>svg]:w-full", className)} role="img" aria-label={text} dangerouslySetInnerHTML={{ __html: svg }} />;
}
