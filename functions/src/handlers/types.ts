import type { LiveRoundRequest, LiveRoundResponses } from "@bingo/core";

export type Req<A extends LiveRoundRequest["action"]> = Extract<LiveRoundRequest, { action: A }>;
export type Res<A extends keyof LiveRoundResponses> = LiveRoundResponses[A];
