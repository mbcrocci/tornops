import { useId } from "react";
import { cn } from "@/lib/utils";

/** War banner with a tally cut into it. Uses currentColor, so it follows the theme. */
export function TornOpsLogo({ className }: { className?: string }) {
  const maskId = useId();

  return (
    <svg viewBox="0 0 64 64" className={cn("size-5", className)} aria-hidden>
      <mask id={maskId}>
        <rect width="64" height="64" fill="#fff" />
        <g fill="#000">
          <rect x="21" y="15" width="5" height="22" rx="1" />
          <rect x="29.5" y="15" width="5" height="22" rx="1" />
          <rect x="38" y="15" width="5" height="22" rx="1" />
        </g>
        <line
          x1="17"
          y1="34"
          x2="48"
          y2="18"
          stroke="#000"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
      </mask>
      <rect fill="currentColor" x="8" y="9" width="6" height="51" rx="1" />
      <rect fill="currentColor" x="6" y="4" width="10" height="5" rx="1.5" />
      <path
        mask={`url(#${maskId})`}
        fill="currentColor"
        d="M14 9H59L53 15 60 20.5 52 26 58 31 51 36.5 56 43H14Z"
      />
    </svg>
  );
}
