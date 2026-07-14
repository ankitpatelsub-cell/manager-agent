// llm.js — minimal OpenRouter client (reuses Hermes key from .env). Falls back to null if no key.
const https = require('https');
function chat(messages, { json = false, temperature = 0.3, max_tokens = 300 } = {}) {
  return new Promise((resolve, reject) => {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return resolve(null);
    const body = JSON.stringify({ model: process.env.OPENROUTER_MODEL || 'tencent/hy3:free', messages, temperature, max_tokens });
    const req = https.request({ hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'HTTP-Referer': 'https://nihon-offshore', 'X-Title': 'Nihon-Manager' } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { const j = JSON.parse(d); resolve(j.choices?.[0]?.message?.content || null); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}
module.exports = { chat };
