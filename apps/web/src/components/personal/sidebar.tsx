"use client";

import * as React from "react";
import { Code2, Rocket, User } from "lucide-react";

import { SavedFooter, Sidebar } from "@/components/shell/sidebar";
import { SearchInput } from "@/components/ui/input";

export function PersonalSidebar() {
  const [query, setQuery] = React.useState("");
  const items = [
    {
      href: "/user/settings/account",
      label: "Account",
      icon: <User className="h-4 w-4" />,
    },
    {
      href: "/user/settings/review",
      label: "Review",
      icon: <Code2 className="h-4 w-4" />,
    },
    {
      href: "/user/settings/integrations",
      label: "Connections",
      icon: <Rocket className="h-4 w-4" />,
    },
  ];
  const needle = query.trim().toLowerCase();

  return (
    <Sidebar
      groups={[
        {
          label: "Personal",
          items: needle
            ? items.filter((i) => i.label.toLowerCase().includes(needle))
            : items,
        },
      ]}
      header={
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search settings..."
          className="h-9"
        />
      }
      footer={<SavedFooter />}
    />
  );
}
