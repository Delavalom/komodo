"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The URL is the state container — filters, active tab, open drawer.
 * `set` deletes empty values so the default state writes no params, matching
 * the original's encodings exactly. docs/SPEC.md §3.
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, params],
  );

  const get = useCallback(
    (key: string) => params.get(key) ?? undefined,
    [params],
  );

  return { params, get, set };
}
