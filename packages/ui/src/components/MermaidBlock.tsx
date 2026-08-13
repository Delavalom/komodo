import { useCallback, useRef, useState } from "react";

// Singleton state so we only initialise the library once across renders.
let initialised = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mermaidLib: any = null;

async function renderDiagram(diagram: string): Promise<string> {
  if (!mermaidLib) {
    const mod = await import("mermaid");
    mermaidLib = mod.default;
  }
  if (!initialised) {
    mermaidLib.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose",
      themeVariables: {
        background: "#0d0f12",
        primaryColor: "#1e2128",
        primaryTextColor: "#e5e7eb",
        lineColor: "#3ecf8e",
        edgeLabelBackground: "#161a22",
      },
    });
    initialised = true;
  }
  // A unique id per render avoids Mermaid's internal cache collisions.
  const id = `mermaid-${Math.random().toString(36).slice(2)}`;
  const { svg } = await mermaidLib.render(id, diagram);
  return svg as string;
}

/**
 * Renders a Mermaid diagram into a host node.
 *
 * Mermaid needs a real DOM node, so the work is driven by a ref callback —
 * it runs when the node attaches and its cleanup runs when it detaches.
 */
export function MermaidBlock({ diagram }: { diagram: string }) {
  const [error, setError] = useState<string | null>(null);
  // Bumped on every attach/detach so an in-flight render that resolves late
  // can tell it is stale. React 18 ref callbacks cannot return a cleanup
  // function, so the token replaces one.
  const token = useRef(0);

  const host = useCallback(
    (node: HTMLDivElement | null) => {
      const current = ++token.current;
      if (!node) return;

      node.className = "mermaid-loading";
      node.textContent = "Rendering diagram…";

      void renderDiagram(diagram).then(
        (svg) => {
          if (token.current !== current) return;
          node.className = "mermaid-block";
          node.innerHTML = svg;
          setError(null);
        },
        (e: unknown) => {
          if (token.current !== current) return;
          node.textContent = "";
          setError(e instanceof Error ? e.message : String(e));
        },
      );
    },
    [diagram],
  );

  if (error) return <pre className="mermaid-error">{error}</pre>;
  return <div ref={host} />;
}
