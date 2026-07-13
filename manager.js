// manager.js — orchestrator that delegates to the 3 specialist agents via HTTP.
// Receives a high-level request, classifies it, calls the right agent's API,
// collects results, and returns a unified report. Truly multi-agent.
const AGENTS = {
  backoffice: { url: 'http://localhost:8092/api/run', kind: 'run' },
  mfp: { url: 'http://localhost:8093/api/diagnose', kind: 'diagnose' },
  hospital: { url: 'http://localhost:8094/api/intake', kind: 'intake' },
};

function classify(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('プリンタ') || t.includes('複合機') || t.includes('トナー') || t.includes('紙詰まり') || t.includes('mfp') || t.includes('printer')) return 'mfp';
  if (t.includes('受付') || t.includes('予約') || t.includes('待ち') || t.includes('列') || t.includes('患者') || t.includes('hospital') || t.includes('queue') || t.includes('受診') || t.includes('混雑') || t.includes('待合')) return 'hospital';
  return 'backoffice'; // default: general back-office
}

async function callAgent(which, payload) {
  const a = AGENTS[which];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(a.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const data = await res.json();
    return { agent: which, ok: true, data };
  } catch (e) {
    return { agent: which, ok: false, error: e.message };
  } finally { clearTimeout(t); }
}

async function orchestrate(request) {
  const target = classify(request);
  const payload = target === 'mfp' ? { symptom: request }
    : target === 'hospital' ? { patient: request, channel: 'message' }
    : { task: request };
  const steps = [
    { step: 'think', result: `(思考) ルーティング: ${target} エージェントへ委任` },
  ];
  const r = await callAgent(target, payload);
  steps.push({ step: 'delegate', result: `${target} → ${r.ok ? '成功' : '失敗: ' + r.error}` });
  if (r.ok) {
    const trace = r.data.trace || r.data.steps || [];
    for (const s of trace) steps.push({ step: 'observe:' + target, result: s.result || s.tool });
  }
  steps.push({ step: 'done', result: '統合レポート完了' });
  return { target, steps, raw: r.ok ? r.data : null };
}

module.exports = { orchestrate, classify };
