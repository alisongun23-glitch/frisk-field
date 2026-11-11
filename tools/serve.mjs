// Local preview server. Serves the project and wraps index.html in the same document skeleton the
// Artifact host adds when the page is published, so local and published pages render alike.
// Usage: node tools/serve.mjs   (PORT=8123 by default)
//
// It is for your own computer only:
// - it listens on 127.0.0.1, so other devices on your network can't open it;
// - it answers only requests addressed to localhost, so other websites can't reach it through DNS rebinding;
// - it serves only files inside the project, never dot files or folders (.git, .env, .claude);
// - a malformed request gets an error reply instead of stopping the server.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8123;
const HOST = '127.0.0.1';
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9.-]+\.localhost)$/i;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const HEAD = '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  + '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
  + 'body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>'
  + '</head><body>';

createServer(async (req, res) => {
  const reply = (code, text) => res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' }).end(text);
  const hostname = String(req.headers.host ?? '').replace(/:\d+$/, '');
  if (!LOCAL_HOST.test(hostname)) return reply(403, 'Forbidden');
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(405, 'Method not allowed');

  let rel;
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    rel = path === '/' ? 'index.html' : path.slice(1);
  } catch {
    return reply(400, 'Bad request');
  }
  const file = normalize(join(root, rel));
  // Split on both slashes so a backslash can't slip a dot folder past the check on Windows.
  if (!file.startsWith(root) || rel.split(/[\\/]/).some((part) => part.startsWith('.'))) {
    return reply(403, 'Forbidden');
  }

  try {
    let body = await readFile(file);
    if (rel === 'index.html') body = `${HEAD}${body}</body></html>`;
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    reply(404, 'Not found');
  }
}).listen(port, HOST, () => console.log(`Frisk Field running at http://localhost:${port}`));
