import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0A0B0D",
        surface: "#111318",
        border: "#1E2128",
        "border-subtle": "#161A22",
        mint: "#3ECF8E",
        "mint-dim": "#2BA06A",
        muted: "#6B7280",
        "text-base": "#E5E7EB",
        "text-dim": "#9CA3AF",
        critical: "#EF4444",
        major: "#F97316",
        minor: "#EAB308",
        trivial: "#3B82F6",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
    },
  },
};

export default config;
