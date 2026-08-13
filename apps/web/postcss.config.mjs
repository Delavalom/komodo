/**
 * Must be .mjs (or .js/.cjs) — Next.js does not read a TypeScript PostCSS
 * config, and silently skips it, which leaves Tailwind uncompiled.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
