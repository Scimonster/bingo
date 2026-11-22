/** Limits and defaults from the spec ("Limits and defaults"). Enforced in rules and Functions. */
export const LIMITS = {
  gridMin: 3,
  gridMax: 9,
  boardsPerSheetMin: 1,
  boardsPerSheetMax: 4,
  infoTextMax: 3000,
  textItemMax: 200,
  titleMax: 100,
  slotLabelMax: 40,
  headingMax: 120,
  imageUploadMaxBytes: 10 * 1024 * 1024,
  playerNameMin: 1,
  playerNameMax: 30,
  sheetsPerPlayerMin: 1,
  sheetsPerPlayerMax: 10,
  autoDrawMinSec: 5,
  autoDrawMaxSec: 300,
  patternsPerRoundMin: 1,
  patternsPerRoundMax: 10,
  generateMaxPerCall: 500,
  sheetsPerGameMax: 2000,
  roundRetentionDays: 30,
  staleRoundHours: 24,
  exportRetentionDays: 7,
  displayTokenTtlHours: 24,
  joinCodeLength: 6,
  marginMinMm: 0,
  marginMaxMm: 30,
} as const;

export const DEFAULTS = {
  rows: 5,
  cols: 5,
  boardsPerSheet: 3,
  sheetsPerPlayer: 1,
  autoDrawIntervalSec: 20,
  marginMm: 10,
  /** Variety warning threshold: items per cell. */
  varietyRatio: 2,
} as const;

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** Marker stored in a board's cells for the free space. */
export const FREE = "FREE";

export const DAY_MS = 24 * 60 * 60 * 1000;
