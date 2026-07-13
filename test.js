// test.js — minimal smoke tests for the Manager Orchestrator routing.
const assert = require('assert');
const { classify } = require('./manager');

(async () => {
  assert(classify('患者の受付をQRで') === 'hospital', 'reception -> hospital');
  assert(classify('今月のチケットを要約して') === 'backoffice', 'general -> backoffice');
  console.log('✓ routing: hospital/backoffice');
  console.log('\nALL MANAGER TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
