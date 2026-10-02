/**
 * Optional password gate for exposing the local server (e.g. through a Cloudflare tunnel).
 * Enabled only when a password is given (env NONPAREILLE_PASSWORD). It protects /api/*;
 * the static UI bundle stays public because it holds no data, and the UI redirects to
 * /login when the API answers 401.
 */
import { timingSafeEqual } from "node:crypto";

// biome-ignore lint/suspicious/noExplicitAny: wraps Bun route handlers of any request shape
type Handler = (req: any, server?: any) => Response | Promise<Response>;
type Routes = Record<string, Partial<Record<"GET" | "POST" | "PUT" | "DELETE", Handler>>>;

const COOKIE = "np_session";
const MAX_FAILS_PER_MINUTE = 10;

function equal(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function cookieValue(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

function loginPage(error: boolean): Response {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nonpareille (논파레유) — 들어가기</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FBF5EA;color:#3B2414;font:400 17px/1.75 "Pretendard Variable",Pretendard,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
form{background:#FFFDF8;border:1px solid rgba(59,36,20,.10);border-radius:20px;box-shadow:0 1px 2px rgba(59,36,20,.06),0 12px 32px -12px rgba(59,36,20,.18);padding:36px;width:min(360px,calc(100vw - 48px))}
h1{margin:0 0 4px;color:#7A3E1B;font-size:26px;font-weight:800;letter-spacing:-.02em}
p{margin:0 0 20px;color:#7C6553;font-size:15px}
input{width:100%;box-sizing:border-box;padding:12px 16px;border-radius:999px;border:1px solid rgba(59,36,20,.18);font:inherit;background:#FBF5EA;color:#3B2414}
button{margin-top:14px;width:100%;padding:12px 16px;border:0;border-radius:999px;background:#7A3E1B;color:#FFF8EE;font:700 16px/1.4 inherit;cursor:pointer}
button:hover{background:#5F2F13}
:focus-visible{outline:3px solid #C8742A;outline-offset:3px}
.err{color:#9B2C1A;font-size:14px;margin:10px 0 0}
</style></head><body>
<form method="post" action="/login"><h1>Nonpareille</h1><p>흩어진 점을, 하나의 그림으로. 비밀번호를 입력해 주세요.</p>
<label for="pw" style="position:absolute;left:-999px">비밀번호</label>
<input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
<button type="submit">들어가기</button>${error ? '<p class="err" role="alert">비밀번호가 맞지 않아요.</p>' : ""}</form>
</body></html>`;
  return new Response(html, { status: error ? 401 : 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

export function createAuth(password: string | undefined) {
  const enabled = password !== undefined && password.length > 0;
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  const fails = new Map<string, number[]>();

  const authed = (req: Request): boolean => !enabled || equal(cookieValue(req, COOKIE) ?? "", token);

  const login: Routes = {
    "/login": {
      GET: () => loginPage(false),
      POST: async (req: Request) => {
        const ip = req.headers.get("cf-connecting-ip") ?? "local";
        const now = Date.now();
        const recent = (fails.get(ip) ?? []).filter((t) => now - t < 60_000);
        if (recent.length >= MAX_FAILS_PER_MINUTE) {
          return new Response("Too many attempts, try again in a minute.", { status: 429 });
        }
        const form = await req.formData();
        if (!enabled || !equal(String(form.get("password") ?? ""), password)) {
          fails.set(ip, [...recent, now]);
          return loginPage(true);
        }
        const secure = req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:";
        return new Response(null, {
          status: 303,
          headers: {
            location: "/",
            "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? "; Secure" : ""}`,
          },
        });
      },
    },
  };

  function protect<R extends Routes>(routes: R): R {
    if (!enabled) return routes;
    const out: Routes = {};
    for (const [path, methods] of Object.entries(routes)) {
      out[path] = {};
      for (const [m, h] of Object.entries(methods) as [keyof Routes[string], Handler][]) {
        out[path][m] = (req: Request, server?: unknown) =>
          authed(req)
            ? h(req, server)
            : Response.json({ error: "login required" }, { status: 401 });
      }
    }
    return out as R;
  }

  return { enabled, protect, login, authed };
}
