import * as React from "react";
import { ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function DataTable({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-[2px] border border-border">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function THead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("bg-secondary text-muted-foreground", className)}
      {...props}
    />
  );
}

export function TH({
  className,
  children,
  sortable,
  sorted,
  onSort,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  sortable?: boolean;
  sorted?: "asc" | "desc" | null;
  onSort?: () => void;
}) {
  return (
    <th
      className={cn(
        "label-mono h-11 border-b border-border px-4 text-left text-[11px] font-normal",
        className,
      )}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className="label-mono inline-flex items-center gap-1.5 text-[11px] transition-colors hover:text-foreground"
        >
          {children}
          {sorted ? (
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-100",
                sorted === "asc" ? "rotate-180" : "",
              )}
            />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function TR({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors duration-100 last:border-b-0 hover:bg-muted-accent/40",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}

export function EmptyRow({
  colSpan,
  children,
  className,
}: {
  colSpan: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={cn(
          "border-b border-border px-4 py-16 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {children}
      </td>
    </tr>
  );
}
