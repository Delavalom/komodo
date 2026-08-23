import Link from "next/link";
import { KomodoMark } from "@/components/ui/display";

export default function NotFound() {
  return (
    <div className="flex h-full flex-1 items-center justify-center overflow-y-auto bg-background px-4">
      <div className="relative w-full max-w-[502px] border border-border bg-card px-8 py-14 text-center">
        <Corner className="-left-[3px] -top-[3px]" />
        <Corner className="-right-[3px] -top-[3px]" />
        <Corner className="-bottom-[3px] -left-[3px]" />
        <Corner className="-bottom-[3px] -right-[3px]" />

        <KomodoMark className="mx-auto h-10 w-10" />
        <div className="mt-4 text-[86px] font-bold leading-none tracking-tight">
          404
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-2 rounded-[2px] bg-[hsl(var(--komodo-brand-green))] px-3 text-sm font-medium text-[hsl(var(--color-gray-950))] transition-colors hover:bg-[hsl(153_75%_63%)]"
          >
            <span aria-hidden>←</span>
            Go Back
          </Link>
          <a
            href="https://github.com/Delavalom/komodo#readme"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center rounded-[2px] bg-secondary px-3 text-sm transition-colors hover:bg-muted-accent"
          >
            View Docs
          </a>
        </div>
      </div>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`absolute h-1.5 w-1.5 bg-[hsl(var(--color-yellow-500))] ${className}`}
    />
  );
}
