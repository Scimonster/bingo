import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { liveRound } from "../../lib/callables";
import { fmt, useT } from "../../lib/i18n";
import { Alert, Button, Input } from "../../components/ui";
import { normalizeSerialInput, parseSheetQr } from "../../components/live/liveUtils";
import { playerError } from "./playerCommon";

/** "Link my sheet" for paper rounds: scan the sheet's QR, or type its number. */
export function LinkSheetDialog({ gameId, sessionId, onClose, onLinked }: { gameId: string; sessionId: string; onClose: () => void; onLinked: (serial: string) => void }) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const link = async (serial: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await liveRound({ action: "linkSheet", gameId, sessionId, serial });
      onLinked(serial);
    } catch (e) {
      setError(playerError(e, t));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const linkRef = useRef(link);
  linkRef.current = link;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let last = "";
    const scanner = new QrScanner(
      video,
      (result) => {
        if (result.data === last) return;
        last = result.data;
        const parsed = parseSheetQr(result.data);
        if (!parsed) setError(t("notASheetQr"));
        else if (parsed.gameId !== gameId) setError(t("wrongGame"));
        else void linkRef.current(parsed.serial);
      },
      { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true },
    );
    scanner.start().then(
      () => setCamera("on"),
      () => setCamera("off"),
    );
    return () => {
      scanner.stop();
      scanner.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const serial = normalizeSerialInput(text);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("linkMySheet")} className="max-h-[95dvh] w-full max-w-md overflow-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <h2 className="mb-3 text-2xl font-bold">{t("linkMySheet")}</h2>
        <div className="relative mb-3 overflow-hidden rounded-xl bg-black" style={{ display: camera === "off" ? "none" : undefined }}>
          <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
        </div>
        <p className="mb-4 text-center text-slate-600">{camera === "off" ? t("cameraUnavailable") : t("scanQr")}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (serial) void link(serial);
          }}
          className="space-y-3"
        >
          <label htmlFor="link-serial" className="block text-sm font-semibold">{camera === "off" ? t("enterSerial") : `${t("or")}: ${t("enterSerial")}`}</label>
          <div className="flex gap-2">
            <Input id="link-serial" dir="ltr" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} placeholder="042" className="h-12 text-center font-mono text-xl" />
            <Button type="submit" size="lg" disabled={!serial || busy}>{busy ? t("linking") : t("link")}</Button>
          </div>
        </form>
        {busy && <p className="mt-2 text-center text-slate-600">{serial ? fmt(t("linkingSheet"), { serial }) : t("linking")}</p>}
        {error && <Alert kind="error" className="mt-3">{error}</Alert>}
        <Button variant="outline" size="lg" className="mt-4 w-full" onClick={onClose}>{t("cancel")}</Button>
      </div>
    </div>
  );
}
