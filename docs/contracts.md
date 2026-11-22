# Implementation contracts

Clarifications on top of `docs/spec.md` that every part of the codebase must agree on. Types live in
`packages/core/src/types.ts`; callable request/response schemas in `packages/core/src/api.ts`.

## Firestore documents

Times are epoch milliseconds (`number`) everywhere **except** TTL fields: every `expireAt` is a
Firestore `Timestamp` (TTL policies require it).

### `games/{gameId}` — written by the owner's client

Create (non-anonymous user only) with exactly these keys:
`ownerId` (= auth uid), `title` (1–100 chars), `createdAt` (serverTimestamp), `playerLanguage`
("he" | "en"), `settings` (GameSettings), `printLayout` (PrintLayout), optional `customPatterns`
(Pattern[] with `cells`, max 20). Never `contentLocked` / `clonedFrom` (Functions only).

Owner updates may change only `title`, `playerLanguage`, `settings`, `printLayout`, `customPatterns`.
Once `contentLocked == true`: `settings.rows`, `settings.cols`, `settings.boardsPerSheet`,
`settings.freeSpace.enabled/row/col` are frozen (`settings.freeSpace.content` stays editable — it only
affects display/print). No client delete (use `deleteGame`).

### `games/{g}/items/{itemId}` — owner client, only while the game is unlocked

`{ type: "text", text, createdAt }` or `{ type: "image", storagePath, text? (caption), createdAt }`.
`storagePath` is the image **folder** `users/{uid}/images/{imageId}`; it holds `thumb.webp` (≈256 px,
screens) and `print.webp` (≈1200 px, printing). Text ≤ 200 chars.

### `games/{g}/sheets/{serial}` and `boards/{boardId}` — Functions only

Sheet doc ID = zero-padded serial (`formatSerial`), board ID = `boardId(serial, slot)`.

### `games/{g}/members/{uid}` — Functions only. `{ sessions: { [sessionId]: "player" | "display" }, expireAt? }`

### `games/{g}/sessions/{sessionId}` — see `Session` type

Function-written: everything at creation (`status: "lobby"`), `draws`, `assignments`, `winners`,
`summary`, `joinCode`, `createdAt`, `endedAt`, `lastActivityAt`, `totalItems` (bag size),
`waitingCount` (players waiting for sheets), `pendingClaims` (claims awaiting host), `autoDraw.nextDrawAt`.

Owner client may update only: `status` (lobby→live, live→paused, paused→live; never to/from
"ended" — use `endRound`), `autoDraw.enabled`, `autoDraw.intervalSec` (5–300), `patterns` (1–10),
`verification`, `boardsPerPlayer` (1–10), `autoMark`, `onWin`. Nothing once `status == "ended"`.
(The console normally uses the `setAutoDraw` action, which also sets `nextDrawAt`.)

Serials inside a round (`assignments` keys, `players.sheets`, `players.marks` keys, `claims.serial`,
`winners.serial`) are zero-padded strings.

- `private/drawState` `{ remaining: string[], expireAt? }`, `private/display` `{ tokenHash, expiresAt (ms), used: boolean, expireAt? }` — never client-readable.
- `players/{uid}` `{ name, sheets, marks, waitingForSheets (number), joinedAt, expireAt? }`.
  Player client may update only `name` (1–30) and `marks` (keys ⊆ own `sheets`, values arrays of
  cell indices). Owner client may update only `name`.
- `claims/{claimId}` — Functions only; see `Claim` type. Readable by owner, display members, and the
  claimant (`uid == auth.uid`).

### `joinCodes/{code}` — Functions only, no client access. `{ gameId, sessionId, open, expireAt }`

## Who can read

- Owner: everything under their game.
- Member (`members/{uid}` exists): game doc, items, sheets, boards; a session only if
  `members/{uid}.sessions[sessionId]` is set; players: only their own doc, or all if they are a
  display of that session; claims: own (or all if display).

## Storage

- `users/{uid}/images/{imageId}/{thumb|print}.webp`: owner (non-anonymous) may create/overwrite;
  image/png|jpeg|webp|gif, < 10 MB. Any signed-in user may `get`; only the owner may `list`. No deletes.
- `exports/{gameId}/{file}.pdf`: written by Functions; readable by the game owner only.

## Info box — `printLayout.infoText`, `infoMode`, `infoImage`, `infoImageFit`

`infoText` (≤ 3000 chars) is the markup defined in `packages/core/src/markdown.ts`: blocks are
paragraphs, `# `/`## ` headings, `- `/`1. ` list items and image lines `![s|m|l](users/{uid}/images/{id})`,
optionally prefixed with `{center} ` or `{end} `; inline `**bold**`, `_italic_`, `++underline++`,
`[text]{red large}` (colours `INFO_COLORS`, sizes `INFO_SIZES`); `\` escapes markers. Clients write
it with `serializeInfoText` (the editor) and `sanitizeInfoText`; everyone reads it with
`parseInfoText` (AST, never HTML). Image lines with any other path are plain text.

`infoMode: "image"` with `infoImage` (an image folder) shows that image in the info box instead of the
text; `infoImageFit` is `"contain"` (default) or `"cover"`. `printLayoutImages(pl)` lists every image a
layout references (cleanup keeps them all); `printLayoutRenderImages(pl)` only those a sheet shows (PDF
export loads them).

## Shared sheet components — `@bingo/sheet`

```ts
type CellView =
  | { kind: "text"; text: string }
  | { kind: "image"; url?: string; caption?: string }
  | { kind: "free"; text?: string; url?: string }; // url absent → star
type Resolve = (cellId: string) => CellView;     // cellId is an item ID or FREE

makeResolver(items: Record<string, { type: "text"|"image"; text?: string; storagePath?: string }>,
             freeContent: CellContent | undefined,
             urlFor: (storagePath: string) => string | undefined): Resolve

<SheetStyles />                       // injects sheetCss once; required wherever the components render
<ItemCell view variant="screen"|"print" />
<BoardGrid cells rows cols resolve variant? marked?: ReadonlySet<number> highlighted?: ReadonlySet<number>
           onCellClick?: (index) => void label?: string className? />
<SheetLayout serial boards={string[][] /* index = slot */} settings printLayout lang resolve qrSvg
             backgroundUrl? imageUrl?: (storagePath) => string | undefined /* info images */ />
<InfoText md imageUrl? boxHeightMm? />
qrSvg(text: string): Promise<string>  // SVG markup
renderSheetsHtml({ pages: SheetLayoutProps[], fontCss: string, lang }): string // full HTML doc for Puppeteer
```

Board cell order is identical in every language: grids are always laid out LTR (`direction: ltr` on
the grid), only text inside cells uses `dir="auto"`.

## Live round flow notes

- `startRound` returns `displayToken`; the console keeps it in sessionStorage. "Copy display link"
  calls `createDisplayLink` (tokens are single-use) and copies `${origin}/display/${token}`.
- The player app remembers its last joined round per game in localStorage key
  `bingo:lastRound:{gameId}` = `{ sessionId }` (used by `/s/:gameId/:serial`).
- Auto-draw: the console calls `draw` with `auto: true` when `Date.now() >= autoDraw.nextDrawAt`;
  the server refuses auto draws while `pendingClaims > 0` or the bag is empty.
- `submitClaim` from the host (owner) for a paper sheet is decided immediately (host is verifying).
- `liveRound` is a single 2nd-gen callable; `ping` warms it.
