import { ReviewList } from "./components/ReviewList";
import { ReviewDetail } from "./components/ReviewDetail";
import { useHash } from "./store";

export default function App() {
  const hash = useHash();
  const detailMatch = /^#\/reviews\/(.+)$/.exec(hash);

  if (detailMatch) {
    const id = decodeURIComponent(detailMatch[1]);
    return (
      <ReviewDetail
        id={id}
        onBack={() => {
          window.location.hash = "#/";
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__logo">
          <span className="app-header__mark">🦎</span>
          <span className="app-header__name">Komodo</span>
          <span className="app-header__sub">Review Viewer</span>
        </div>
      </header>
      <main className="app-main">
        <ReviewList />
      </main>
    </div>
  );
}
