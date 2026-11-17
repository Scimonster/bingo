<!-- Copy of the design spec doc https://claude.ai/artifact/D7yqbPFgRQimMbXagaskNC (2026-11-17). -->

# Bingo System — Design Spec
2026-11-16 · Eyal Schachter
## Overview
An online bingo system: a host creates a game from text or image content, generates numbered printable sheets, and runs rounds that players play on paper or on their own phone or computer. The stack is a React + TypeScript PWA on Firebase (Auth, Firestore, Storage, Cloud Functions, Hosting).
**In scope**

- 
Game setup: content (text and images), board size, free space, boards per sheet, print layout.
- 
Sheet generation, PDF printing, and identification by serial number.
- 
Rounds in two modes: central (host draws with a spinner, claims are verified) and self (players mark their own boards, no checks).
- 
Paper or digital boards per round, join by code, a projector view, replay and duplication of games.
- 
Automatic cleanup of finished rounds.
**Out of scope for v1**

- 
Co-hosts or multiple host roles.
- 
Player accounts or cross-round player history.
- 
Per-round content sets (all rounds of a game use the same content).
- 
Payments, prizes, or chat.
- 
Scale beyond about 100 players per round.
## Glossary
The UI says "round" where the code says "session". Users only ever see serial numbers, never board IDs.

|
Term |
Meaning |
|
Game |
What is being played: content, board size, free space, boards per sheet, print layout. Owned by one host. |
|
Item |
One piece of content (text, or an image with an optional caption) that can appear in a cell and be drawn. |
|
Sheet |
One printout with one serial number. Holds one board per slot. |
|
Serial |
The sheet's number (e.g. 042), unique within a game. The only identifier people see or type. |
|
Slot |
A position on a sheet, labelled e.g. "Game 1", "Game 2", "Game 3". Each round plays one slot. |
|
Board |
A grid of item IDs (plus the free space) for one slot of one sheet. Internal only. |
|
Round (session) |
One play-through of a game: medium, mode, slot, draws, players, claims, winners. |
|
Medium |
Per round: `paper` (players hold printed sheets) or `digital` (sheets assigned to devices). |
|
Mode |
Per round: `central` (spinner + claims) or `self` (players mark their own, no checks). |
|
Join code |
Short code that lets a player join a live round. Valid only while the round is open. |
|
Host |
The game owner. Signed-in, non-anonymous account. The only role with control. |
|
Player |
An anonymous signed-in user who joined a round with a name. |
|
Display |
An anonymous signed-in device (e.g. a TV) showing the projector view through a display link. |
|
Pattern |
A cell mask that counts as a win (line, column, diagonal, corners, blackout, custom). |
## Requirements and decisions
**Game setup**

- 
A host creates a game with a title, board size (rows × cols), optional free space at a chosen cell, and boards per sheet (1–4).
- 
Content is a set of text items and/or images. All rounds of a game use the same content.
- 
Board size, free space and boards per sheet freeze once sheets exist. Title and print layout stay editable.
**Sheets and printing**

- 
The host generates sheets. Each sheet has one serial number and one board per slot.
- 
A printout shows the serial, a QR code, one board per slot labelled with its slot label ("Game 1", "Game 2", "Game 3"), and a free-text info area. Info text is the same on every sheet.
- 
Within a slot, every board is unique across all sheets. Boards on the same sheet differ from each other in both items and layout.
**Rounds**

- 
A round chooses its medium (paper or digital), mode (central or self), and slot. These are fixed once the round starts.
- 
Players join a round with a join code and a free-text name.
- 
Digital rounds assign sheets to players from the game's sheets; default cap is 1 sheet per player, host-configurable. If no unassigned sheets are left, the player waits and the host is alerted.
- 
Paper rounds never assign sheets. A player may link the sheet they hold by scanning its QR code.
- 
Central mode: draws are manual or on an auto timer (both available). Claim verification is a host setting: automatic, or host confirms.
- 
A projector view shows the join code, spinner, drawn items and winners.
- 
A game can be replayed (new round, same sheets) or duplicated (copy of settings and content, new sheets).
- 
Players can recover on a new device via the host moving their sheets to the new player entry.
- 
Finished rounds are cleaned up automatically; a summary is kept.
**Scale and roles**

- 
Under 100 players per round.
- 
One host role (the game owner). No co-hosts.
- 
Hebrew with right-to-left layout on everything players see: player app, projector and printed sheets.
## Architecture and stack
A single-page React app talks to Firestore directly for reads and simple owner-scoped writes; anything that must be fair, atomic or private goes through callable Cloud Functions. Shared game logic lives in one package used by both the app and the Functions, so client highlighting and server verification can never disagree.
[diagram: system architecture · 3 clients, 4 Firebase services]

The host console, player app and projector are one React app. Draws, joins, claims and generation run as callable Functions that write Firestore and Storage; game rules come from `packages/core`, shared by both sides.
**Frontend**

|
Concern |
Choice |
|
Framework |
React + TypeScript, built with Vite |
|
Delivery |
Single-page app on Firebase Hosting; PWA via `vite-plugin-pwa` |
|
Routing |
TanStack Router or React Router |
|
Live data |
Firestore `onSnapshot` wrapped in hooks; TanStack Query for one-off fetches and mutations |
|
UI |
Tailwind CSS + shadcn/ui; boards are CSS grids |
|
Animation |
Framer Motion for the spinner reveal |
|
Validation |
zod schemas from the shared package |
|
QR |
A QR library for printed sheets, join codes and the scanner |
**Firebase services**

|
Service |
Role |
|
Auth |
Hosts: Google sign-in only. Players and displays: anonymous auth |
|
Firestore |
Games, items, sheets, boards, rounds, players, claims, join codes |
|
Storage |
Images (resized in the host's browser before upload) and exported PDFs |
|
Cloud Functions |
Generation, PDF export, joins, draws, claims, cleanup (TypeScript) |
|
App Check |
Protects public join and play endpoints |
|
Emulator Suite |
Local development and rules tests |
**Repository layout (pnpm monorepo)**
```
apps/web          React app
functions/        Cloud Functions
packages/core     Types, zod schemas, sheet generator, patterns, win checker
firestore.rules   storage.rules   firebase.json
```

## Data model
Three top-level concepts, each justified by a requirement: a game holds content; sheets (and their boards) belong to the game so printouts survive replays; rounds hold everything about one play-through. Fields marked ⚙️ are written only by Cloud Functions.
**Firestore**
```
games/{gameId}
  ownerId, title, createdAt, playerLanguage: "he"|"en"
  settings:    { rows, cols, freeSpace: { enabled, row, col, content?: { type: "text"|"image", text?, storagePath? } }, boardsPerSheet }
  printLayout: { heading?, slotLabels: ["Game 1", ...], infoText, paperSize, orientation, arrangement: "row"|"column"|"grid"|"single", marginMm }
  contentLocked ⚙️                       true once sheets exist
  clonedFrom? ⚙️

games/{gameId}/items/{itemId}
  type: "text"|"image", text?, storagePath?, createdAt

games/{gameId}/sheets/{serial} ⚙️        doc ID is the zero-padded serial, e.g. "042"
  serial: 42, boardIds: [b0, b1, b2]     index = slot

games/{gameId}/boards/{boardId} ⚙️
  sheetSerial, slot, cells: [itemId | "FREE", ...]   flattened rows × cols
  fingerprint                             hash used for uniqueness checks

games/{gameId}/members/{uid} ⚙️
  sessions: { [sessionId]: "player" | "display" }, expireAt

games/{gameId}/sessions/{sessionId}
  medium ⚙️: "paper"|"digital"   mode ⚙️: "central"|"self"   sheetSlot ⚙️
  status: "lobby"|"live"|"paused"|"ended"     lobby/ended ⚙️, live/paused by host
  verification: "auto"|"host"   boardsPerPlayer   autoMark   onWin: "continue"|"end"
  patterns: [...]
  autoDraw: { enabled, intervalSec, nextDrawAt ⚙️ }
  draws ⚙️: [{ itemId, at }]
  assignments ⚙️: { [serial]: uid }
  winners ⚙️: [{ name, serial, pattern, at }]
  summary ⚙️: { drawCount, playerCount, durationSec }   written at end

  private/drawState ⚙️   { remaining: [itemId...] }     never client-readable
  private/display ⚙️     { tokenHash, expiresAt }
  players/{uid}           { name, sheets ⚙️: [serial], marks: { [serial]: [cellIndex] },
                            waitingForSheets ⚙️, joinedAt ⚙️, expireAt ⚙️ }
  claims/{claimId} ⚙️     { serial, uid, playerName, matchedPattern, computedValid,
                            status: "pending"|"valid"|"invalid", drawCount, createdAt, decidedAt, expireAt }

joinCodes/{code} ⚙️
  gameId, sessionId, open, expireAt
```

**Storage**
```
users/{uid}/images/{imageId}/{thumb,print}.webp   two sizes, resized client-side
exports/{gameId}/{file}.pdf      sheet PDFs; deleted by a bucket lifecycle rule after 7 days
```

Images are resized in the host's browser before upload (canvas or `createImageBitmap`), producing a small thumbnail for screens and a larger version for printing. This avoids the Resize Images extension: Firebase Extensions are deprecated and shut down on March 31, 2027. If server-side resizing is ever needed, it becomes our own Storage-triggered Function using `sharp`.
Images live under the uploading host, not the game, so duplicated games share files. They are deleted by a cleanup job only when no item references them.
**Notes**

- 
Boards store explicit cells rather than a seed, so printed sheets stay valid if the generator changes.
- 
Marks are cosmetic. Verification always uses `draws`, so a wrong mark can never produce a false win.
- 
At under 100 players, draws, assignments and winners fit comfortably on the session document.
## Core logic (packages/core)
All game rules are pure TypeScript functions with no Firebase dependency, unit-tested in isolation and imported by both the app and the Functions.
**Sheet generation** — `generateSheets(items, settings, count, existingFingerprints)`

- 
Cells per board = rows × cols, minus one if the free space is enabled. Generation fails if there are fewer items than cells.
- 
For each slot, generate `count` boards: pick cells from the items without replacement using a cryptographic RNG, place them in random order, insert `FREE` at the free-space index.
- 
Fingerprint each board (hash of its ordered cells). Reject and re-roll any board whose fingerprint already exists in that slot, including sheets generated earlier.
- 
Per sheet, check that its boards share at most about half their items with each other. Re-roll a slot's board when the overlap is too high.
- 
Serials continue from the game's highest existing serial.
The content editor shows a variety meter: below 2× items per cell it warns that boards will look alike and the overlap rule may be hard to satisfy.
**Patterns**

- 
A pattern is a set of cell indices for the game's grid: `{ id, name, cells: number[] }`. Rows, columns, both diagonals, four corners and blackout are built in; hosts draw custom shapes in a pattern editor (tap cells on the grid), which is in scope for v1.
- 
A "line" win is a pattern group (any row, any column, either diagonal).
- 
The free space is configured per game: on or off, at any cell (default centre), with optional content that can be anything an ordinary cell holds: text, or an image with an optional caption (default a star). It is never drawn. Otherwise it is an ordinary cell: when on, its index is added to the board's covered cells before patterns are checked, and the player view shows it pre-marked.
**Win checking** — `checkBoard(board, drawnItemIds, patterns)`

- 
Returns the patterns fully covered by drawn items (plus the free-space index, when on), and for each unmet pattern how many cells are still missing.
- 
The player app uses the missing counts to highlight near-wins.
- 
`submitClaim` calls the same function; its result is authoritative.
**Randomness**

- 
Stored sheets and the draw bag use `crypto.getRandomValues` / Node `crypto.randomInt` with a Fisher–Yates shuffle, never `Math.random`.
The generator takes its RNG as a parameter, so sample previews can pass a fast seeded RNG and run entirely client-side.
## End-to-end flows
Each step notes whether the client writes directly or a Function (⚙️) does the work.

- 
**Create game.** The host signs in; the client writes the game doc with title, settings and print layout. Rules restrict creation to non-anonymous users.
- 
**Add content.** Text items are added one by one or pasted one per line. Images upload to `users/{uid}/images/` and the client writes an item doc with the path. Items are editable until sheets exist.
- 
**Preview sample sheets.** Before generating, the Sheets tab renders a few sample sheets in the browser from the current content, settings and print layout, using the same generator from packages/core with a fast seeded (non-cryptographic) RNG. Samples are not stored, carry no serial, and can be reshuffled; they show how varied the boards look and how the printout lays out.
- 
**Generate sheets.** ⚙️ `generateSheets(gameId, count)` validates item count, generates boards per slot with the uniqueness and overlap rules, writes sheets and boards in batches, and sets `contentLocked`. The same call tops up later. "Reset sheets" deletes all sheets and unlocks content, with a warning that printouts become invalid.
- 
**Print.** ⚙️ `exportSheetsPdf(gameId, fromSerial, toSerial)` renders one sheet per page using the print layout and returns a download URL. A paper self-mode game can stop here: players mark their printouts and no round is needed.
- 
**Start round.** ⚙️ `startRound(gameId, options)` takes medium, mode, slot (default: next unplayed), verification, patterns, sheet cap, auto-mark and on-win behaviour. It creates the session in `lobby`, shuffles every item that appears on any board into `private/drawState`, creates the join code, and creates a display token.
- 
**Join.** The player opens `/join/CODE` (or types it), signs in anonymously and enters a name. ⚙️ `joinRound(code, name)` creates the player and the membership.

- 
Digital: assigns up to `boardsPerPlayer` unassigned sheets at random in a transaction. Any shortfall goes into `waitingForSheets` and alerts the host.
- 
Paper: assigns nothing. "Link my sheet" scans the sheet's QR and calls ⚙️ `linkSheet(sessionId, serial)`, which checks the game, that the sheet is unlinked in this round, and the cap.
- 
**Go live and draw (central mode).** The host sets the status to `live`. ⚙️ `draw(sessionId, expectedCount)` runs only if `draws.length` equals `expectedCount`, pops the next item from the bag and appends it, so a manual press and the auto timer can't double-draw. Auto-draw runs from the host console using `nextDrawAt` and pauses when the bag is empty, a claim awaits the host, or the console disconnects. The projector animates each new draw. Self mode skips this step.
- 
**Mark.** Players tap cells; the client writes their own `marks`. With `autoMark` on, drawn items are marked automatically.
- 
**Claim (central mode).** The player taps Bingo on a board; ⚙️ `submitClaim(sessionId, serial)` resolves the board for the round's slot, runs `checkBoard`, and writes the claim. For a paper player without a phone, the host types the serial in the console and calls the same Function.

- 
Auto verification: a valid claim is accepted immediately and added to `winners`.
- 
Host verification: the claim is `pending`, auto-draw pauses, and ⚙️ `decideClaim(claimId, accept)` resolves it.
- 
Each sheet wins each pattern at most once per round. After a valid win, the round continues or ends per `onWin`.
- 
**End round.** ⚙️ `endRound(sessionId)` writes the summary, closes the join code and stamps `expireAt` on round data for cleanup.
- 
**Play again.** Start a new round on the same game, usually on the next slot. Paper sheets are reused; digital players rejoin with the new code.
- 
**Duplicate game.** ⚙️ `cloneGame(gameId)` copies settings, print layout and items (images by reference) to a new unlocked game with no sheets.
- 
**Device switch.** The player joins on the new device with their name. In the console the host picks "Move sheets from…"; ⚙️ `reassignPlayer(sessionId, fromUid, toUid)` moves sheets, marks, assignments and claims, and removes the old entry.
## Cloud Functions
All callables check the caller's role (owner, player, display) themselves; Admin SDK writes bypass security rules.

|
Function |
Type |
Caller |
Does |
|
`generateSheets` |
callable |
host |
Creates sheets + boards, locks content, assigns waiting digital players |
|
`exportSheetsPdf` |
callable |
host |
Renders a serial range to a PDF in Storage, returns its URL |
|
`startRound` |
callable |
host |
Creates the round, draw bag, join code and display token |
|
`draw` |
callable |
host |
Draws the next item, idempotent on `expectedCount` |
|
`decideClaim` |
callable |
host |
Accepts or rejects a pending claim |
|
`removePlayer` |
callable |
host |
Removes a player and releases their sheets |
|
`reassignPlayer` |
callable |
host |
Moves a player's sheets, marks and claims to a new player entry |
|
`endRound` |
callable |
host, scheduler |
Summary, closes join code, stamps TTL |
|
`deleteRound` |
callable |
host |
Deletes a past round and its subcollections |
|
`cloneGame` |
callable |
host |
Copies settings, layout and items to a new game |
|
`deleteGame` |
callable |
host |
Recursively deletes a game and its rounds |
|
`joinRound` |
callable |
player |
Resolves the code, creates player + membership, assigns digital sheets |
|
`linkSheet` |
callable |
player |
Links a held paper sheet in a paper round |
|
`submitClaim` |
callable |
player, host |
Verifies a sheet's board for this round's slot and records the claim |
|
`redeemDisplayToken` |
callable |
display |
Exchanges a display link token for a display membership |
|
`autoEndStaleRounds` |
scheduled, daily |
— |
Ends rounds with no joins or draws for 24 hours |
|
`cleanupUnreferencedImages` |
scheduled, weekly |
— |
Deletes images no item references |
**Cold starts.** No Function is kept always on. Instead:

- 
All round-time actions (`startRound`, `joinRound`, `linkSheet`, `draw`, `submitClaim`, `decideClaim`, `removePlayer`, `reassignPlayer`, `endRound`) are served by one 2nd-gen callable, `liveRound`, that dispatches on an `action` field. During a game, draws, joins and claims keep its instance warm, and 2nd-gen concurrency lets one instance serve the whole room.
- 
The host console warms it up: opening the console sends a `ping` action, and the console repeats it every few minutes while a round is in lobby or live, so the first join and first draw don't hit a cold start.
- 
Setup, admin and scheduled Functions (generation, PDF export, clone, delete, cleanup) stay separate, since their latency doesn't affect play.
## Security model
Clients write only what they own and what can't affect fairness; everything else is Function-only. A first draft of `firestore.rules` and `storage.rules` accompanies this spec and needs an emulator test suite before use.
**Firestore access**

|
Path |
Read |
Client write |
|
`games/{g}` |
owner, members |
owner (non-anonymous): create; update title, settings, print layout. Board shape frozen once locked. No delete |
|
`items` |
owner, members |
owner, only while unlocked |
|
`sheets`, `boards` |
owner, members |
none |
|
`members/{uid}` |
that user |
none |
|
`sessions/{s}` |
owner, members of that round |
owner: status (lobby→live⇄paused), autoDraw enabled/interval, patterns, verification, cap, autoMark, onWin; nothing once ended |
|
`private/*` |
nobody |
none |
|
`players/{uid}` |
owner, that player, display |
player: own name and marks (only for their sheets). Owner: rename |
|
`claims` |
owner, display, claimant |
none |
|
`joinCodes` |
nobody |
none |
**Membership.** `joinRound` and `redeemDisplayToken` write `games/{g}/members/{uid}`. That doc lets an anonymous user read the game's content and only the rounds they joined. Winners are copied to `session.winners` so all members see them, while claims stay private.
**Storage.** Hosts upload images (PNG, JPEG, WebP, GIF, up to 10 MB) only into their own folder. Any signed-in user may fetch an image by path; paths are random and only the owner can list them, so Firestore decides who learns a path. Clients can't delete images. Exported PDFs are readable by the game owner only.
**Other protections**

- 
App Check on all callables and Firestore.
- 
The display token is single-use and stored hashed.
- 
Join codes avoid ambiguous characters (0/O, 1/I/L) and expire.
## Screens and routes
Three audiences with separate layouts: the host console (laptop), the player app (phone first), and the projector (large screen read from across a room).

|
Route |
Who |
Screen |
|
`/` |
anyone |
Landing: join-code input and host sign-in |
|
`/games` |
host |
My games: list, create, duplicate |
|
`/games/:gameId` |
host |
Game hub: Content · Sheets · Rounds · Settings tabs |
|
`/games/:gameId/rounds/:sessionId` |
host |
Host console |
|
`/present/:gameId/:sessionId` |
host, display |
Projector view |
|
`/display/:token` |
display |
Redeems the token, then opens the projector view |
|
`/join`, `/join/:code` |
player |
Code entry, then name entry |
|
`/play/:gameId/:sessionId` |
player |
Player boards |
|
`/s/:gameId/:serial` |
player |
Sheet QR landing: links the sheet in the player's active paper round, asking for the join code first if needed |
**Game hub tabs**

- 
Content: text list with paste-many, image grid with multi-upload, the variety meter. Read-only with a lock indicator once sheets exist.
- 
Sheets: generate N, browse by serial, live print preview, print layout editor (heading, slot labels, info text, paper size, orientation), export a serial range, reset sheets.
- 
Rounds: Start round dialog and past rounds with summaries.
- 
Settings: title, grid size, free space, boards per sheet, delete game.
**Host console**

- 
Top bar: status, slot label, join code, player count, draws so far / total, open projector, copy display link, end round.
- 
Draw panel: Draw button, auto-draw toggle with interval and countdown, current item.
- 
Claims queue: each pending claim shows the board with matched cells highlighted, Accept / Reject; a "Check a paper sheet" serial input.
- 
Players panel: names and serials, "waiting for sheets" alert with Generate more, rename, remove, move sheets.
- 
Drawn items grid.
**Player app**

- 
Join: code → name → "Getting your sheet…" or "Waiting for the host to add sheets".
- 
Play: the board for this round's slot on each held sheet, swipeable when there are several; latest-draw banner; winner toasts; a Bingo button per board (hidden in self mode); "Link my sheet" scanner in paper rounds.
- 
Ended: winners and a thank-you.
**Projector**

|
State |
Shows |
|
Lobby |
Title, large join code + QR, live player count |
|
Live |
Spinner and current item, grid of all items with drawn ones lit, last 5 draws, draw count, auto-draw countdown |
|
Win |
Overlay: player name, "Sheet № 042 · Game 2", winning pattern on the board |
|
Ended |
Winners and total draws |
The projector plays the spin when it sees a new draw; the result is already decided. It uses the Fullscreen API, Screen Wake Lock and a high-contrast theme.
**Shared components**

- 
`<BoardGrid>` with screen and print variants, used in the player app, claim review, win overlay and print layout.
- 
`<ItemCell>` (auto-fitting text, or an image with `object-fit: contain`), `<SpinReveal>`, `<JoinQR>`, `<DrawnItemsGrid>`, `<SheetLayout>`.
## Printing
One sheet prints on one page: a header with the heading, serial and QR code, one board per slot under its label, and the info text at the foot. For three 5×5 boards the default is A4 or Letter landscape, which gives each board about 85–90 mm square and cells of about 17 mm.
[diagram: printed sheet layout · landscape, 3 slots]

The QR links the whole sheet; the round's slot decides which of its boards is played and checked.

- 
Portrait stacks the boards vertically and shrinks the info area.
- 
The print preview warns when cells drop below about 12 mm (e.g. grids above 6×6 with three boards).
- 
The QR encodes `/s/{gameId}/{serial}`.
- 
The free space shows its configured text or image, or a star by default. Image cleanup treats a free-space image as referenced.
- 
Info text is basic rich text (bold, italic, bullet and numbered lists, line breaks), stored as sanitized Markdown, up to 1,500 characters, identical on every sheet.
- 
Images print from the larger resized variant.
- 
Bulk export renders server-side in `exportSheetsPdf` by printing the same `<SheetLayout>` HTML with headless Chromium (see Language and RTL). The browser print preview uses that component with `@media print` styles for a single sheet, so preview and PDF match.
**Layouts and paper sizes**
The layout is part of `printLayout` and can change at any time, even after sheets exist, since it only affects printing. The drawing above shows the row arrangement.

|
Arrangement |
Boards placed |
Header and info text |
Typical use |
|
Row |
side by side |
header on top, info below |
landscape, 2–3 boards |
|
Column |
stacked |
header on top, info below |
portrait, 2–3 boards |
|
Grid 2×2 |
each board in a quarter of the page |
with 3 boards, the fourth quadrant holds serial, QR and info; with 4, a thin header strip and no info area |
larger cells, A4 or A3 |
|
Single |
one board fills the page |
header on top, info below |
1 board per sheet, posters |

- 
Paper sizes: A5, A4, A3, Letter, Legal and Tabloid (11×17 in), each in portrait or landscape.
- 
Margins default to 10 mm; the preview flags layouts whose cells come out under about 12 mm.
- 
Rough cell sizes at 5×5: grid 2×2 on A4 about 17 mm, on A3 about 25 mm.
## Language and RTL
Hebrew with right-to-left layout is required everywhere players look: the player app, the projector and printed sheets. The host UI ships in English first and is built i18n-ready.

- 
**Player language** is a game setting, `playerLanguage: "he" | "en"`, editable at any time. It sets `<html lang dir>` and the string catalog for the player app and projector.
- 
**Content** (items, slot labels, heading, info text) may be Hebrew, English or mixed. Every user-written string renders with `dir="auto"`, so its direction follows its first strong character.
- 
**Layout** uses CSS logical properties (`margin-inline-start`, `inset-inline-end`) and Tailwind `rtl:` variants, so screens mirror without separate stylesheets.
- 
**Board grids keep one cell order in every language.** A printed sheet, the player's phone and the host's claim review show the same cell in the same place; patterns are stored by cell index and are unaffected.
- 
**Fonts:** one Hebrew-capable family with good Latin glyphs (e.g. Heebo, Rubik or Noto Sans Hebrew), self-hosted so the PWA works offline and the PDF renderer embeds the same font.
- 
**PDF export:** PDF libraries such as pdf-lib do no bidirectional layout or shaping, so `exportSheetsPdf` renders the `<SheetLayout>` HTML in headless Chromium (Puppeteer) and prints it to PDF. This keeps preview and PDF identical and handles mixed Hebrew and English. The Function needs about 1–2 GB of memory and sits outside the live-round path.
- 
**Join codes and serials** stay Latin letters and digits so they read the same in both languages.
## Data lifecycle
Finished rounds keep only a summary on the session document; their detail is deleted 30 days after the round ends by Firestore TTL policies, with no code to run.

|
Data |
Removed when |
Mechanism |
|
Players, claims, `private/*` of a round |
30 days after round end |
TTL on `expireAt`, stamped by `endRound` |
|
Memberships |
30 days after the member's last round ends |
TTL on `expireAt` |
|
Join codes |
When the round ends, or on expiry |
`endRound` deletes; TTL as backstop |
|
Abandoned rounds |
No joins or draws for 24 hours |
`autoEndStaleRounds` runs `endRound` |
|
Session doc with summary and winners |
When the host deletes it |
`deleteRound` |
|
Games, sheets, boards, items |
When the host deletes the game |
`deleteGame` |
|
Images |
When no item references them |
`cleanupUnreferencedImages` |
|
Exported PDFs |
7 days after export |
Storage lifecycle rule |
## Limits and defaults
These values are first picks, enforced in security rules or Functions, and easy to change.

|
Setting |
Limit |
Default |
|
Grid size |
3–9 per side |
5 × 5 |
|
Free space |
any cell |
on, centre |
|
Boards per sheet |
1–4 |
3 |
|
Slot labels |
one per slot |
Game 1, Game 2, Game 3 |
|
Info text |
up to 1,500 characters |
empty |
|
Text item |
up to 200 characters |
— |
|
Image upload |
up to 10 MB; PNG, JPEG, WebP, GIF |
— |
|
Player name |
1–30 characters |
— |
|
Sheets per player |
1–10 |
1 |
|
Auto-draw interval |
5–300 s |
20 s |
|
Patterns per round |
1–10 |
any line |
|
Overlap between boards on one sheet |
— |
at most about half their items |
|
Variety warning |
— |
below 2× items per cell |
|
Round retention |
— |
30 days |
|
Stale round |
— |
24 h without activity |
|
Players per round |
designed for under 100 |
— |
## Open items and implementation plan
**Open items**

|
Question |
Decision |
|
Custom pattern editor in v1 |
Yes |
|
Info text formatting |
Basic rich text: bold, italic, lists, line breaks |
|
Host sign-in providers |
Google only |
|
Languages and RTL |
Hebrew RTL required for all player-facing content; see Language and RTL |
|
Self mode on paper |
A round in the app is optional; printouts alone are enough |
**Implementation order**

- 
Scaffold the monorepo, Firebase project config and emulators; CI running typecheck, unit tests and rules tests.
- 
`packages/core`: types and zod schemas, sheet generator, patterns, win checker, with unit tests.
- 
Rules test suite against the draft `firestore.rules` and `storage.rules`.
- 
Host setup: auth, games list, content editor, image upload, `generateSheets`.
- 
Printing: `<SheetLayout>`, print preview, layout editor, `exportSheetsPdf`.
- 
Rounds: `startRound`, join codes, `joinRound`, `linkSheet`, player app.
- 
Play: `draw`, auto-draw, pattern editor, marking, `submitClaim`, `decideClaim`, host console.
- 
Projector view and display links.
- 
Lifecycle: `endRound`, TTL policies, scheduled jobs, replay, duplicate, device switch.
- 
PWA polish, App Check, accessibility and load test with 100 simulated players.
