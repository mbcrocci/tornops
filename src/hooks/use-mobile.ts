import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;
/** Tailwind's `lg`: wide enough for every roster column. */
const WIDE_BREAKPOINT = 1024;

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}

export function useIsWide(): boolean {
  return useMediaQuery(`(min-width: ${WIDE_BREAKPOINT}px)`);
}
