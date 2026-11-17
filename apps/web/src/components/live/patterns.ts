import { BUILTIN_PATTERNS } from "@bingo/core";
import type { StringKey } from "../../lib/i18n";

/** Player-language name of a pattern: built-ins are translated, custom patterns keep their own name. */
export function patternLabel(t: (k: StringKey) => string, p: { id?: string | null; name: string }): string {
  const b = BUILTIN_PATTERNS.find((x) => x.id === p.id);
  if (b && b.name === p.name) return t(`pattern_${b.id}` as StringKey);
  return p.name;
}
