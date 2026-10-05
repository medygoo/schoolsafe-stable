import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "./config/env.js";
import { startVerifiedPools } from "./db/startpools.js";
import { buildNativeApp } from "./native-app.js";

const env = parseEnv(process.env);
const pools = await startVerifiedPools(env);
if (!pools) {
  throw new Error("PostgreSQL du VPS requis : configurer PGHOST, PGDATABASE et les identifiants des rôles schoolsafe_auth et schoolsafe_api.");
}
const app = buildNativeApp(env, pools);

try {
  // Fonctionne avec tsx (server/src) et après compilation (server/dist/src).
  const appRoot = ["../../app", "../../../app"]
    .map(relative => path.resolve(import.meta.dirname, relative))
    .find(candidate => existsSync(path.join(candidate, "index.html")));
  if (!appRoot) throw new Error("Fichiers de l’application SchoolSafe introuvables.");
  const supabaseOrigin = env.SUPABASE_URL ? new URL(env.SUPABASE_URL).origin : "";
  if (supabaseOrigin) {
    app.addHook("onSend", async (_request, reply, payload) => {
      const type = reply.getHeader("content-type");
      if (typeof type === "string" && type.includes("text/html")) {
        reply.header("Content-Security-Policy", [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self'",
          `connect-src 'self' blob: http://127.0.0.1:8787 http://localhost:8787 ${supabaseOrigin}`,
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join("; "));
      }
      return payload;
    });
  }
  await app.register(fastifyStatic, { root: appRoot, prefix: "/", wildcard: true });
  // Le catalogue public est partagé avec le frontend, sans exposer le dépôt.
  app.get("/shared/permissions.json", (_request, reply) =>
    reply.sendFile("permissions.json", path.resolve(appRoot, "../shared")));
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  await app.close();
  throw error;
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => { void app.close(); });
}
