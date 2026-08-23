import { cn } from "@/lib/utils";

export function MemoryNavIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("h-4 w-4", className)}>
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="8" cy="8" r="2" />
        <ellipse cx="8" cy="8" rx="6.6" ry="2.8" />
        <ellipse cx="8" cy="8" rx="6.6" ry="2.8" transform="rotate(60 8 8)" />
        <ellipse cx="8" cy="8" rx="6.6" ry="2.8" transform="rotate(120 8 8)" />
      </g>
    </svg>
  );
}

export function PullRequestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("h-4 w-4", className)}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="4" cy="3.2" r="1.6" />
        <circle cx="4" cy="12.8" r="1.6" />
        <circle cx="12" cy="12.8" r="1.6" />
        <path d="M4 4.8v6.4M12 11.2V7.2a2 2 0 0 0-2-2H7.4" />
        <path d="M9 3.4 7.2 5.2 9 7" />
      </g>
    </svg>
  );
}
