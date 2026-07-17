import { useEffect, useState } from "react";
import { ReviewList } from "./components/ReviewList";
import { ReviewDetail } from "./components/ReviewDetail";

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const handler = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const detailMatch = /^#\/reviews\/(.+)$/.exec(hash);

  if (detailMatch) {
    const id = decodeURIComponent(detailMatch[1]);
    return (
      <main className="app-main">
        <ReviewDetail id={id} onBack={() => { window.location.hash = "#/"; }} />
      </main>
    );
  }

  return (
    <main className="app-main">
      <header className="app-header">
        <div className="app-header__logo">
          <span className="app-header__mark">🦎</span>
          <span className="app-header__name">Komodo</span>
          <span className="app-header__sub">Review Viewer</span>
        </div>
      </header>
      <ReviewList />
    </main>
  );
}
