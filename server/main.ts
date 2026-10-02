import index from "../ui/index.html";
import { createApp } from "./api.ts";
import { createAuth } from "./auth.ts";
import { createFakeProvider } from "./fake-provider.ts";
import { createJobs } from "./jobs.ts";
import { createStore, defaultStoreDir } from "./store.ts";

const fake = process.env.NONPAREILLE_FAKE_PROVIDER === "1";
const app = createApp({
  store: createStore(defaultStoreDir()),
  jobs: createJobs(),
  ...(fake ? { providerFactory: () => createFakeProvider() } : {}),
});

const auth = createAuth(process.env.NONPAREILLE_PASSWORD);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 5177),
  development: process.env.NODE_ENV !== "production",
  routes: { "/": index, ...auth.login, ...auth.protect(app.routes) },
  fetch: app.fetch,
});

console.log(`Nonpareille running at ${server.url}${fake ? " (fake provider)" : ""}${auth.enabled ? " (password required)" : ""}`);
