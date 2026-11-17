import { describe, expect, it } from "vitest";
import { anon, gameWithSheets, getSession, live, newHost } from "./helpers";

describe("load", () => {
  it("100 concurrent joins into a 100-sheet digital round each get one distinct sheet", async () => {
    const host = await newHost();
    const gameId = await gameWithSheets(host, 100, { items: 20 });
    const { sessionId, joinCode } = await live(host, { action: "startRound", gameId, options: { medium: "digital", mode: "central" } });
    const players = Array.from({ length: 100 }, (_, i) => ({ ctx: anon(), name: `Player ${i}` }));
    const results = await Promise.all(players.map((p) => live(p.ctx, { action: "joinRound", code: joinCode, name: p.name })));
    for (const r of results) {
      expect(r.sheets).toHaveLength(1);
      expect(r.waitingForSheets).toBe(0);
    }
    const sheets = results.map((r) => r.sheets[0]);
    expect(new Set(sheets).size).toBe(100);
    const s = await getSession(gameId, sessionId);
    expect(Object.keys(s.assignments)).toHaveLength(100);
    players.forEach((p, i) => expect(s.assignments[sheets[i]!]).toBe(p.ctx.uid));
    expect(s.waitingCount).toBe(0);
  });
});
