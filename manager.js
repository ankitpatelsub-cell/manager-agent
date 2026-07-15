// manager.js — orchestrator that delegates to ALL specialist agents via HTTP.
// Routing: keyword-first (reliable, free) -> OpenRouter LLM -> local Claude CLI (free) -> default.
const llm = require('./llm');
let claudeTask = null;
try { claudeTask = require('./claude_worker').claudeTask; } catch { /* optional */ }

const AGENTS = {
  backoffice: { url: 'http://localhost:8092/api/run', kind: 'run', jp: 'バックオフィス' },
  hospital:   { url: 'http://localhost:8094/api/intake', kind: 'intake', jp: '病院' },
  hotel:      { url: 'http://localhost:8096/api/checkin', kind: 'checkin', jp: 'ホテル' },
  car:        { url: 'http://localhost:8097/api/chat', kind: 'chat', jp: '自動車' },
  reels:      { url: 'http://localhost:8098/api/reel', kind: 'reel', jp: 'リール' },
  manager:    { url: null, kind: 'self', jp: 'マネージャー' },
};

const KEYWORDS = {
  hospital: ['受付', '予約', '待ち', '列', '患者', '病院', 'hospital', 'queue', '受診', '混雑', '待合', 'appointment', 'doctor', 'patient', 'clinic', 'token', '診察'],
  hotel:    ['ホテル', 'hotel', '宿泊', '予約', 'チェックイン', 'check-in', 'booking', '部屋', '客室', 'stay'],
  car:      ['車', 'car', '自動車', '中古', '新車', '下取', 'exchange', '試乗', 'value', '価格', 'ローン', 'loan', 'dealership', 'maruti', 'honda', 'toyota'],
  reels:    ['リール', 'reel', '動画', 'video', '宣伝', 'promo', 'marketing video'],
  backoffice: ['ticket', 'email', 'report', 'summarize', 'schedule', 'task', 'チケット', 'メール', '報告', '要約', 'タスク', 'lead', 'leads', '営業'],
};

function keywordFallback(text) {
  const t = (text || '').toLowerCase();
  for (const agent of ['hospital', 'hotel', 'car', 'reels', 'backoffice']) {
    if (KEYWORDS[agent].some(w => t.includes(w.toLowerCase()))) return agent;
  }
  return null; // no keyword matched
}

async function classify(text) {
  const t = (text || '').trim();
  if (!t) return 'backoffice';
  const provider = (process.env.MODEL_PROVIDER || 'auto').toLowerCase();
  // 1) Keyword fallback FIRST — reliable, free, instant (authoritative when matched)
  const kw = keywordFallback(text);
  if (kw) return kw;
  // 2) OpenRouter LLM (only if provider allows and key+model set)
  if (provider === 'openrouter' || (provider === 'auto' && process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL)) {
  try {
    const sys = `You are a router for a multi-agent system. Pick the BEST agent for the request.
Return ONLY one word from: hospital, hotel, car, reels, backoffice, manager.
- hospital: patients, appointments, queues, clinics, doctors
- hotel: hotel bookings, check-in, rooms
- car: vehicles, test-drive, valuation, exchange, loans
- reels: marketing video generation
- backoffice: tickets, email, reports, leads, general tasks
- manager: meta questions about the system itself`;
    const out = await llm.chat([{ role: 'system', content: sys }, { role: 'user', content: t }]);
    if (out) {
      const w = out.trim().toLowerCase();
      for (const a of Object.keys(AGENTS)) if (w.includes(a)) return a;
    }
  } catch { /* fall through */ }
  } // end OpenRouter provider block
  // 3) Local Claude CLI (free, authenticated) — used when OpenRouter credits exhausted
  if (claudeTask) {
    try {
      const r = claudeTask(`Classify this request into exactly one of: hospital, hotel, car, reels, backoffice, manager. Reply with ONLY the one word. Request: ${t}`);
      if (r.ok) {
        const w = r.text.trim().toLowerCase();
        for (const a of Object.keys(AGENTS)) if (w.includes(a)) return a;
      }
    } catch { /* fall through */ }
  }
  // 4) Default
  return 'backoffice';
}

async function callAgent(which, payload) {
  const a = AGENTS[which];
  if (!a || !a.url) return { agent: which, ok: true, data: { note: 'manager (self)' } };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(a.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
    const data = await res.json();
    return { agent: which, ok: true, data };
  } catch (e) { return { agent: which, ok: false, error: e.message }; }
  finally { clearTimeout(t); }
}

function buildPayload(which, request) {
  switch (AGENTS[which].kind) {
    case 'intake': return { patient: request, channel: 'message' };
    case 'checkin': return { guest: request, channel: 'site', locale: 'en' };
    case 'chat': return { message: request };
    case 'reel': return { brief: request, lang: 'en' };
    default: return { task: request };
  }
}

async function orchestrate(request) {
  const target = await classify(request);
  const steps = [{ step: 'think', result: `(思考) routing: -> ${target} (${AGENTS[target]?.jp || target})` }];
  const r = await callAgent(target, buildPayload(target, request));
  steps.push({ step: 'delegate', result: `${target} -> ${r.ok ? 'success' : 'fail: ' + r.error}` });
  if (r.ok && r.data) {
    const trace = r.data.trace || r.data.steps || r.data.script || r.data.entry || [];
    for (const s of trace) steps.push({ step: 'observe:' + target, result: (s.result || s.tool || JSON.stringify(s)).toString().slice(0, 120) });
  }
  steps.push({ step: 'done', result: 'integrated report complete' });
  return { target, steps, raw: r.ok ? r.data : null };
}

module.exports = { orchestrate, classify, keywordFallback, AGENTS };
