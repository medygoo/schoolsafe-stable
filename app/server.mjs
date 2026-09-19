import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, "..");
const cliArgs = process.argv.slice(2);
function cliValue(flag, shortFlag) {
  const index = cliArgs.findIndex((value) => value === flag || value === shortFlag);
  if (index >= 0 && cliArgs[index + 1]) return cliArgs[index + 1];
  const withEquals = cliArgs.find((value) => value.startsWith(flag + "="));
  return withEquals ? withEquals.slice(flag.length + 1) : null;
}
const port = Number(cliValue("--port", "-p") || process.env.PORT || 4175);
const host = cliValue("--host", "-H") || process.env.HOST || "127.0.0.1";
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' blob: http://127.0.0.1:8787 http://localhost:8787",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

function securityHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Security-Policy": contentSecurityPolicy,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=()"
  };
}

http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const relative = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
    const target = requestUrl.pathname === "/shared/permissions.json"
      ? path.resolve(projectRoot, "shared", "permissions.json")
      : path.resolve(root, relative);
    const isCanonicalPermissions = target === path.resolve(projectRoot, "shared", "permissions.json");
    if (!isCanonicalPermissions && !target.startsWith(root + path.sep)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not a file");
    const body = await readFile(target);
    response.writeHead(200, securityHeaders(types[path.extname(target)] || "application/octet-stream"));
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response.writeHead(404, securityHeaders("text/plain; charset=utf-8"));
    response.end("Not found");
  }
}).listen(port, host, () => {
  console.log("SchoolSafe V2 preview: http://" + host + ":" + port);
});
