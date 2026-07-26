import { useDebugValue, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

/**
 * Web replacement for `use-sync-external-store/shim/with-selector` — see
 * `use-sync-external-store-shim-web.ts` for why this needs to exist at all.
 * Same selector-memoization logic as the real
 * `useSyncExternalStoreWithSelector`, just built directly on React's own
 * `useSyncExternalStore` instead of the package's bundled polyfill.
 */
export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot: (() => Snapshot) | undefined,
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (a: Selection, b: Selection) => boolean,
): Selection {
  const instRef = useRef<{ hasValue: boolean; value: Selection | null }>({ hasValue: false, value: null });
  const inst = instRef.current;

  const [getSelection, getServerSelection] = useMemo(() => {
    let hasMemo = false;
    let memoizedSnapshot: Snapshot;
    let memoizedSelection: Selection;

    const memoizedSelector = (nextSnapshot: Snapshot) => {
      if (!hasMemo) {
        hasMemo = true;
        memoizedSnapshot = nextSnapshot;
        const nextSelection = selector(nextSnapshot);
        if (isEqual !== undefined && inst.hasValue) {
          const current = inst.value as Selection;
          if (isEqual(current, nextSelection)) {
            memoizedSelection = current;
            return current;
          }
        }
        memoizedSelection = nextSelection;
        return nextSelection;
      }
      const current = memoizedSelection;
      if (Object.is(memoizedSnapshot, nextSnapshot)) return current;
      const nextSelection = selector(nextSnapshot);
      if (isEqual !== undefined && isEqual(current, nextSelection)) {
        memoizedSnapshot = nextSnapshot;
        return current;
      }
      memoizedSnapshot = nextSnapshot;
      memoizedSelection = nextSelection;
      return nextSelection;
    };

    const maybeGetServerSnapshot = getServerSnapshot === undefined ? null : getServerSnapshot;
    return [
      () => memoizedSelector(getSnapshot()),
      maybeGetServerSnapshot === null ? undefined : () => memoizedSelector(maybeGetServerSnapshot()),
    ] as const;
  }, [getSnapshot, getServerSnapshot, selector, isEqual]);

  const value = useSyncExternalStore(subscribe, getSelection, getServerSelection);

  useEffect(() => {
    inst.hasValue = true;
    inst.value = value;
  }, [value]);

  useDebugValue(value);
  return value;
}
