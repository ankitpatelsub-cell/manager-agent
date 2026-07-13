// server.js — zero-dep server for the Manager Orchestrator.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { orchestrate } = require('./manager');
const { limited } = require('./ratelimit');

const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type });
  if (Buffer.isBuffer(body)) return res.end(body);
  if (typeof body === 'string') return res.end(body);
  res.end(JSON.stringify(body));
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && limited(req.socket.remoteAddress)) return send(res, 429, { error: 'rate limit' });
  async function body() { let b = ''; for await (const c of req) b += c; try { return JSON.parse(b || '{}'); } catch { return {}; } }
  if (req.method === 'POST' && url.pathname === '/api/orchestrate') {
    const b = await body();
    const reqText = (b.request || '').trim();
    if (!reqText) return send(res, 400, { error: 'no request' });
    const r = await orchestrate(reqText);
    return send(res, 200, r);
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const fp = path.join(PUBLIC, p);
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) return send(res, 200, fs.readFileSync(fp), MIME[path.extname(fp)] || 'text/plain');
  return send(res, 404, { error: 'not found' });
});
const PORT = 8095;
server.listen(PORT, '0.0.0.0', () => console.log('Manager on ' + PORT));
