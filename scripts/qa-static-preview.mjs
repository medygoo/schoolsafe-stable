// Loopback-only, credential-free preview of the actual checkout for browser QA.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

export async function startPreview(root = process.cwd()) {
  const app = path.resolve(root, 'app');
  const missing = new Set();
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = pathname === '/shared/permissions.json' ? path.resolve(root, 'shared/permissions.json') : path.resolve(app, '.' + (pathname === '/' ? '/index.html' : pathname));
    const allowed = pathname === '/shared/permissions.json' || file.startsWith(app + path.sep);
    const type = types[path.extname(file)];
    if (!allowed || !type || !fs.existsSync(file) || !fs.lstatSync(file).isFile()) {
      if (type) missing.add(pathname);
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, missing,
    close: () => new Promise(resolve => server.close(resolve)) };
}
