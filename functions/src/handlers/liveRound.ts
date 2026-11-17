import { liveRoundRequestSchema, type LiveRoundResponses } from "@bingo/core";
import type { Ctx } from "../context";
import { parse } from "../errors";
import { decideClaim, submitClaim } from "./claims";
import {
  createDisplayLink,
  draw,
  endRound,
  joinRound,
  linkSheet,
  reassignPlayer,
  removePlayer,
  setAutoDraw,
  startRound,
} from "./round";

/** Dispatches a liveRound request on its `action`. */
export async function liveRoundHandler(ctx: Ctx, data: unknown): Promise<LiveRoundResponses[keyof LiveRoundResponses]> {
  const req = parse(liveRoundRequestSchema, data);
  switch (req.action) {
    case "ping":
      return { ok: true };
    case "startRound":
      return startRound(ctx, req);
    case "joinRound":
      return joinRound(ctx, req);
    case "linkSheet":
      return linkSheet(ctx, req);
    case "draw":
      return draw(ctx, req);
    case "setAutoDraw":
      return setAutoDraw(ctx, req);
    case "submitClaim":
      return submitClaim(ctx, req);
    case "decideClaim":
      return decideClaim(ctx, req);
    case "removePlayer":
      return removePlayer(ctx, req);
    case "reassignPlayer":
      return reassignPlayer(ctx, req);
    case "createDisplayLink":
      return createDisplayLink(ctx, req);
    case "endRound":
      return endRound(ctx, req);
  }
}
