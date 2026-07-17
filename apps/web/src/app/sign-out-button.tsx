"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/sign-in" })}
      className="text-sm px-3 py-1 rounded transition-colors"
      style={{ color: "#6B7280", border: "1px solid #1E2128" }}
    >
      Sign out
    </button>
  );
}
