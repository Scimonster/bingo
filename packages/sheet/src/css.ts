/**
 * Self-contained styles for boards and printable sheets (class prefix `bs-`). Print sizes are
 * in mm; cell text sizes use container query units of the cell (see fit.ts).
 */
export const sheetCss = String.raw`
.bs-root, .bs-page, .bs-board {
  --bs-ink: #17171c;
  --bs-line: #22222a;
  --bs-muted: #5b5b66;
  --bs-paper: #ffffff;
  --bs-free: #fff3c4;
  --bs-star: #e0a100;
  --bs-mark: rgba(220, 38, 38, 0.55);
  --bs-hl: #f59e0b;
  --bs-font: "Heebo", "Rubik", "Noto Sans Hebrew", "Arial Hebrew", Arial, sans-serif;
}

/* ---------- Board grid ---------- */
.bs-board {
  direction: ltr;
  display: grid;
  box-sizing: border-box;
  font-family: var(--bs-font);
  color: var(--bs-ink);
}
.bs-board--screen {
  gap: 3px;
  padding: 3px;
  border-radius: 10px;
  background: var(--bs-line);
  width: 100%;
}
.bs-board--print {
  width: 100%;
  height: 100%;
  gap: 0.3mm;
  border: 0.7mm solid var(--bs-line);
  background: var(--bs-line);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.bs-cell {
  container-type: inline-size;
  position: relative;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bs-paper);
  color: var(--bs-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 7%;
  margin: 0;
  border: 0;
  font: inherit;
}
.bs-board--screen .bs-cell { aspect-ratio: 1 / 1; border-radius: 6px; }
button.bs-cell { cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
button.bs-cell:focus-visible { outline: 3px solid #2563eb; outline-offset: -3px; z-index: 1; }
button.bs-cell:active { filter: brightness(0.94); }

.bs-cell-text {
  display: block;
  width: 100%;
  line-height: 1.12;
  font-weight: 600;
  overflow-wrap: anywhere;
  hyphens: auto;
  white-space: pre-line;
}
.bs-cell-media {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2cqi;
}
.bs-cell-img {
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  object-fit: contain;
  display: block;
}
.bs-cell-img--empty { background: #ececf0; border-radius: 4%; }
.bs-cell-caption {
  flex: none;
  max-width: 100%;
  line-height: 1.1;
  font-weight: 600;
  overflow: hidden;
  overflow-wrap: anywhere;
  max-height: 2.3em;
}
.bs-cell--free { background: var(--bs-free); }
.bs-star { width: 62%; height: 62%; color: var(--bs-star); display: block; }
.bs-cell--free .bs-star--small { width: 34%; height: 34%; flex: none; }

/* states (screen) */
.bs-cell--marked::after {
  content: "";
  position: absolute;
  inset: 9%;
  border-radius: 50%;
  background: var(--bs-mark);
  pointer-events: none;
}
.bs-cell--hl { box-shadow: inset 0 0 0 4px var(--bs-hl); }
.bs-cell--hl.bs-cell--marked::after { background: rgba(245, 158, 11, 0.6); }

/* ---------- Printed sheet ---------- */
.bs-page {
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--bs-paper);
  color: var(--bs-ink);
  font-family: var(--bs-font);
  display: flex;
  flex-direction: column;
  break-after: page;
  page-break-after: always;
  break-inside: avoid;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.bs-page:last-child { break-after: auto; page-break-after: auto; }
.bs-page *, .bs-page *::before, .bs-page *::after { box-sizing: border-box; }

.bs-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5mm;
  border-bottom: 0.6mm solid var(--bs-line);
  padding-bottom: 2mm;
  margin-bottom: 2mm;
}
.bs-header--strip { padding-bottom: 1mm; margin-bottom: 1.5mm; gap: 3mm; border-bottom-width: 0.4mm; }
.bs-heading {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-weight: 700;
  line-height: 1.15;
  overflow: hidden;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.bs-id { flex: none; display: flex; align-items: center; gap: 3mm; }
.bs-serial {
  font-weight: 700;
  white-space: nowrap;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.bs-serial-no { font-weight: 500; color: var(--bs-muted); margin-right: 0.2em; font-size: 0.72em; }
.bs-serial-o { font-size: 0.62em; vertical-align: 0.55em; text-decoration: underline; text-decoration-thickness: 0.09em; text-underline-offset: 0.12em; margin-left: 0.04em; }
.bs-qr { flex: none; display: block; }
.bs-qr svg { display: block; width: 100%; height: 100%; }

.bs-boards { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; }
.bs-boards--row { flex-direction: row; }
.bs-boards--column { flex-direction: column; }
.bs-slot { flex: none; display: flex; flex-direction: column; align-items: stretch; }
.bs-label {
  flex: none;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 1.2mm;
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bs-label > span { overflow: hidden; text-overflow: ellipsis; }
.bs-board-box { flex: none; }

.bs-grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; grid-auto-flow: row dense; }
.bs-quad { min-width: 0; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.bs-meta {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 3mm;
  padding: 2mm 3mm;
  border: 0.4mm solid var(--bs-line);
  border-radius: 3mm;
  overflow: hidden;
}
.bs-meta .bs-heading { flex: none; -webkit-line-clamp: 3; }
.bs-meta-id { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 3mm; }
.bs-meta .bs-info { border-top: 0.3mm solid #c9c9d1; padding-top: 2mm; margin-top: 0; }

.bs-info {
  flex: 0 1 auto;
  min-height: 0;
  overflow: hidden;
  margin-top: 2mm;
  padding-top: 1.5mm;
  border-top: 0.3mm solid #c9c9d1;
  line-height: 1.35;
  color: var(--bs-ink);
}
.bs-md p { margin: 0 0 0.45em; }
.bs-md ul, .bs-md ol { margin: 0 0 0.45em; padding-inline-start: 1.3em; }
.bs-md li { margin: 0; }
.bs-md > :last-child { margin-bottom: 0; }
.bs-md b { font-weight: 700; }

/* ---------- Page background ---------- */
.bs-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.bs-page > :not(.bs-bg):not(style) { position: relative; z-index: 1; }
/* Keep text readable over a background: light backing behind header, labels and info. */
.bs-page--bg .bs-header,
.bs-page--bg .bs-meta,
.bs-page--bg .bs-info {
  background: rgba(255, 255, 255, 0.86);
  border-radius: 2mm;
  padding-inline: 2.5mm;
}
.bs-page--bg .bs-header { padding-top: 1mm; }
.bs-page--bg .bs-info { padding-bottom: 1.5mm; }
.bs-page--bg .bs-label > span { background: rgba(255, 255, 255, 0.86); border-radius: 1mm; padding: 0.3mm 1.5mm; }

/* ---------- Screen preview / browser print ---------- */
@media screen {
  .bs-page { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15), 0 6px 24px rgba(0, 0, 0, 0.08); }
}
@media print {
  .bs-page { box-shadow: none !important; margin: 0 !important; }
  /* In the web app (not the export document), print only the sheet(s): hide everything that
     neither is, contains, nor is inside a .bs-page, and neutralize wrappers around it. */
  body:not(.bs-doc) *:not(.bs-page):not(.bs-page *):not(:has(.bs-page)) { display: none !important; }
  body:not(.bs-doc) :has(> .bs-page), body:not(.bs-doc) :has(.bs-page) {
    display: block !important;
    position: static !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    width: auto !important;
    height: auto !important;
    min-height: 0 !important;
    max-width: none !important;
    overflow: visible !important;
    transform: none !important;
    box-shadow: none !important;
    background: #fff !important;
  }
  body:not(.bs-doc) .bs-page { transform: none !important; zoom: 1 !important; }
  html:has(.bs-page), body:has(.bs-page) { margin: 0 !important; padding: 0 !important; background: #fff !important; }
}
`;
