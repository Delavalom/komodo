import { useEffect, useRef, useState } from "react";

// Singleton state so we only initialise once across re-renders
let initialised = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mermaidLib: any = null;

export function MermaidBlock({ diagram }: { diagram: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
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
              background: "#0e1117",
              primaryColor: "#1c2028",
              primaryTextColor: "#e2e8f0",
              lineColor: "#3ecf8e",
              edgeLabelBackground: "#131820",
            },
          });
          initialised = true;
        }

        // Each render needs a unique id to avoid Mermaid's internal cache collisions
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaidLib.render(id, diagram);

        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setStatus("ok");
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setErrMsg(e instanceof Error ? e.message : String(e));
          setStatus("error");
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [diagram]);

  if (status === "error") return <pre className="mermaid-error">{errMsg}</pre>;
  if (status === "loading") return <p className="mermaid-loading">Rendering diagram…</p>;
  return <div ref={ref} className="mermaid-block" />;
}
