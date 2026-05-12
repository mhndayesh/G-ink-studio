import { useEffect, useRef } from "react";

/**
 * Run `apply` exactly once per `key` after `ready` first becomes true.
 *
 * Use to seed local form state from a fetched JSON document without clobbering
 * subsequent user edits when the query refetches. The keyed ref ensures a
 * navigation to a different story re-hydrates from that story's data.
 */
export function useHydrateOnce(ready: boolean, key: string | undefined, apply: () => void) {
  const hydrated = useRef<string | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (!ready) return;
    const k = key ?? "__nokey__";
    if (hydrated.current === k) return;
    hydrated.current = k;
    applyRef.current();
  }, [ready, key]);
}
