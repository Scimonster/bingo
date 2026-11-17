import { useCallback, useState } from "react";
import { errorMessage } from "../../lib/callables";

/** Runs async actions with a busy key and a last-error message. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(key);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorMessage(e));
      return undefined;
    } finally {
      setBusy((b) => (b === key ? null : b));
    }
  }, []);
  return { busy, error, setError, run };
}
