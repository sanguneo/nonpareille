import { StrictMode, useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import { health } from "./api.ts";
import icon from "./assets/icon-192.png";
import { Pill, ToastHost } from "./components/index.ts";
import Convert from "./screens/Convert.tsx";
import Editor from "./screens/Editor.tsx";
import Gallery from "./screens/Gallery.tsx";
import Generate from "./screens/Generate.tsx";

/* ---------- Hash router ---------- */

type RouteId = "editor" | "generate" | "convert" | "gallery";

interface RouteDef {
  id: RouteId;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  Screen: ComponentType;
}

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const PencilIcon = ({ className }: { className?: string }) => (
  <svg {...svgProps} className={className}>
    <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="m13.5 6.5 3 3" />
  </svg>
);
const SparkIcon = ({ className }: { className?: string }) => (
  <svg {...svgProps} className={className}>
    <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
    <path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" />
  </svg>
);
const ImageIcon = ({ className }: { className?: string }) => (
  <svg {...svgProps} className={className}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m21 16-5-5-8 9" />
  </svg>
);
const GridIcon = ({ className }: { className?: string }) => (
  <svg {...svgProps} className={className}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const ROUTES: readonly RouteDef[] = [
  { id: "editor", label: "에디터", Icon: PencilIcon, Screen: Editor },
  { id: "generate", label: "생성", Icon: SparkIcon, Screen: Generate },
  { id: "convert", label: "변환", Icon: ImageIcon, Screen: Convert },
  { id: "gallery", label: "갤러리", Icon: GridIcon, Screen: Gallery },
];
const DEFAULT_ROUTE = ROUTES[0]!;

function routeFromHash(hash: string): RouteDef {
  const name = /^#\/([a-z]+)/.exec(hash)?.[1];
  return ROUTES.find((route) => route.id === name) ?? DEFAULT_ROUTE;
}

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function useRoute(): RouteDef {
  return useSyncExternalStore(subscribeHash, () => routeFromHash(window.location.hash), () => DEFAULT_ROUTE);
}

/* ---------- Shell ---------- */

function ServerStatus() {
  const [state, setState] = useState<"checking" | "online" | "offline">("checking");
  useEffect(() => {
    let alive = true;
    health().then(
      () => alive && setState("online"),
      () => alive && setState("offline"),
    );
    return () => {
      alive = false;
    };
  }, []);
  const label = state === "online" ? "로컬 서버 연결됨" : state === "offline" ? "서버 응답 없음" : "서버 확인 중";
  return (
    <Pill tone={state === "online" ? "ok" : state === "offline" ? "danger" : "outline"} dot>
      {label}
    </Pill>
  );
}

function Header({ current }: { current: RouteId }) {
  return (
    <header className="app_header">
      <div className="split_nav">
        <div className="split_nav_primary">
          <a className="brand" href="#/editor" aria-label="Nonpareille 홈">
            <img className="brand_mark" src={icon} alt="" width={34} height={34} />
            <span className="brand_text">
              <span className="brand_name">Nonpareille</span>
              <span className="brand_sub">논파레유</span>
            </span>
          </a>
          <nav className="nav_pills" aria-label="주요 화면">
            {ROUTES.map(({ id, label, Icon }) => (
              <a key={id} className="nav_pill" href={`#/${id}`} aria-current={current === id ? "page" : undefined}>
                <Icon className="nav_pill_icon" />
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="split_nav_secondary">
          <ServerStatus />
        </div>
      </div>
    </header>
  );
}

function TabBar({ current }: { current: RouteId }) {
  return (
    <nav className="tabbar" aria-label="주요 화면 (모바일)">
      <ul className="tabbar_list">
        {ROUTES.map(({ id, label, Icon }) => (
          <li key={id}>
            <a className="tabbar_item" href={`#/${id}`} aria-current={current === id ? "page" : undefined}>
              <span className="tabbar_icon">
                <Icon />
              </span>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function App() {
  const route = useRoute();
  const bodyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0);
  }, [route]);

  const skipToMain = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault(); // keep the hash router untouched
    bodyRef.current?.focus();
  };

  const { Screen } = route;
  return (
    <>
      <a className="skip_link" href="#main" onClick={skipToMain}>
        본문으로 건너뛰기
      </a>
      <div className="app_shell">
        <Header current={route.id} />
        <main id="main" className="app_shell_body" tabIndex={-1} ref={bodyRef}>
          <div className="page">
            <Screen />
          </div>
        </main>
        <TabBar current={route.id} />
      </div>
      <ToastHost />
    </>
  );
}

const container = document.getElementById("app");
if (!container) throw new Error('Missing <div id="app">');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
