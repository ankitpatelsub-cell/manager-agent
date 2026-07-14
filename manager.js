// manager.js — orchestrator that delegates to specialist agents via HTTP.
// Routing: LLM-first (Hermes OpenRouter key) with a keyword fallback so it always works.
const llm = require('./llm');
const AGENTS = {
  backoffice: { url: 'http://localhost:8092/api/run', kind: 'run' },
  hospital: { url: 'http://localhost:8094/api/intake', kind: 'intake' },
};

const KEYWORDS = {
  hospital: ['受付', '予約', '待ち', '列', '患者', 'hospital', 'queue', '受診', '混雑', '待合', 'appointment', 'doctor', 'patient', 'clinic', 'token'],
  backoffice: ['ticket', 'email', 'report', 'summarize', 'schedule', 'task', 'チケット', 'メール', '報告', '要約', 'タスク'],
};

function keywordFallback(text) {
  const t = (text || '').toLowerCase();
  for (const [agent, words] of Object.entries(KEYWORDS))
    if (words.some(w => t.includes(w.toLowerCase()))) return agent;
  return 'backoffice';
}

async function classify(text) {
  const t = (text || '').trim();
  if (!t) return 'backoffice';
  try {
    const sys = `You are a router for a multi-agent system. Decide the best agent for the user request.
Return ONLY one word: "hospital" or "backoffice".
- hospital: anything about patients, appointments, queues, clinics, doctors, waiting.
- backoffice: tickets, emails, reports, scheduling, general tasks.`;
    const out = await llm.chat([{ role: 'system', content: sys }, { role: 'user', content: t }]);
    if (out) { const w = out.trim().toLowerCase(); if (w.includes('hospital')) return 'hospital'; if (w.includes('back')) return 'backoffice'; }
  } catch (e) { /* fall through */ }
  return keywordFallback(text);
}

async function callAgent(which, payload) {
  const a = AGENTS[which];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(a.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
    const data = await res.json();
    return { agent: which, ok: true, data };
  } catch (e) { return { agent: which, ok: false, error: e.message }; }
  finally { clearTimeout(t); }
}

async function orchestrate(request) {
  const target = await classify(request);
  const payload = target === 'hospital' ? { patient: request, channel: 'message' } : { task: request };
  const steps = [{ step: 'think', result: `(思考) routing: -> ${target} agent` }];
  const r = await callAgent(target, payload);
  steps.push({ step: 'delegate', result: `${target} -> ${r.ok ? 'success' : 'fail: ' + r.error}` });
  if (r.ok) { const trace = r.data.trace || r.data.steps || []; for (const s of trace) steps.push({ step: 'observe:' + target, result: s.result || s.tool }); }
  steps.push({ step: 'done', result: 'integrated report complete' });
  return { target, steps, raw: r.ok ? r.data : null };
}

module.exports = { orchestrate, classify, keywordFallback };
