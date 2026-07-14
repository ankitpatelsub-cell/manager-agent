// server.js — zero-dep server for the Manager Orchestrator.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { orchestrate } = require('./manager');
const { limited } = require('./ratelimit');
const dash = require('./dashauth');
try { const ep = path.join(__dirname, '.env'); if (fs.existsSync(ep)) for (const line of fs.readFileSync(ep, 'utf8').split('\n')) { const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch {}

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
  if (req.method === 'POST' && url.pathname === '/api/dash-login') {
    const b = await body();
    if (dash.checkPass(b.password)) return send(res, 200, { token: dash.makeToken() });
    return send(res, 401, { error: 'unauthorized' });
  }
  if (req.method === 'GET' && url.pathname === '/api/overview') {
    return send(res, 200, { runs: 0, note: 'orchestrator — routes to specialists' });
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  if (p === '/index.html' && !dash.checkToken(req.headers['x-auth-token'] || (req.headers['cookie'] || '').match(/dash=([^;]+)/)?.[1] || '')) {
    return send(res, 200, dash.LOGIN_HTML, 'text/html');
  }
  const fp = path.join(PUBLIC, p);
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) return send(res, 200, fs.readFileSync(fp), MIME[path.extname(fp)] || 'text/plain');
  return send(res, 404, { error: 'not found' });
});
const PORT = 8095;
server.listen(PORT, '0.0.0.0', () => console.log('Manager on ' + PORT));
