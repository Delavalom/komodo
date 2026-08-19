import type { ReactNode } from "react";

export function PageTitle({
  children,
  badge,
}: {
  children: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <h1 className="text-2xl font-medium tracking-tight">{children}</h1>
      {badge}
    </div>
  );
}
