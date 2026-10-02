import { afterAll, expect, test } from "bun:test";
import { createAuth } from "../server/auth.ts";

const auth = createAuth("s3cret");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  routes: { ...auth.login, ...auth.protect({ "/api/ping": { GET: () => Response.json({ ok: true }) } }) },
  fetch: () => new Response("nf", { status: 404 }),
});
afterAll(() => server.stop(true));
const base = `http://127.0.0.1:${server.port}`;

const login = (password: string) =>
  fetch(`${base}/login`, { method: "POST", body: new URLSearchParams({ password }), redirect: "manual" });

test("api requires login when a password is set", async () => {
  expect((await fetch(`${base}/api/ping`)).status).toBe(401);
});

test("wrong password is rejected, right password sets a session cookie", async () => {
  expect((await login("nope")).status).toBe(401);
  const ok = await login("s3cret");
  expect(ok.status).toBe(303);
  const cookie = ok.headers.get("set-cookie")!.split(";")[0]!;
  const res = await fetch(`${base}/api/ping`, { headers: { cookie } });
  expect(res.status).toBe(200);
});

test("no password means no gate", async () => {
  expect(createAuth(undefined).enabled).toBe(false);
});
