const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLarkReporter, buildReport, payloadFor, validateWebhook, messageParts } = require('./crm-new-lark-report');

const webhookUrl = 'https://open.larksuite.com/open-apis/bot/v2/hook/12345678-1234-1234-1234-123456789abc';
const accounts = [{ role: 'sale', name: 'P5 LAN', sale: 'P5 LAN' }, { role: 'sale', name: 'TP8 TUẤN', sale: 'TP8 TUẤN' }];
const due = Date.parse('2026-09-15T17:30:00+07:00');
const good = () => ({ ok: true, status: 200, json: async () => ({ code: 0, msg: 'success' }) });
function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-lark-unit-'));
  let now = due; const calls = [];
  const args = { directory, readRows: () => [], readAccounts: () => accounts, clock: () => now, fetchImpl: async (url, request) => { calls.push({ url, ...request }); return good(); }, ...options };
  const service = createLarkReporter(args);
  t.after(() => { service.stop(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { service, args, directory, calls, setTime: value => { now = value; } };
}

test('24h report includes old-customer care, late work yesterday, and true results at cutoff', () => {
  const rows = [
    { sale: 'P5 LAN', createdAt: '2026-09-14T17:30:00+07:00', notes: [], history: [] },
    { sale: 'P5 LAN', createdAt: '2026-09-15T17:30:00+07:00', notes: [], history: [] },
    { sale: 'P5 LAN', createdAt: '2026-01-01T08:00:00+07:00', result: '', notes: [{ at: '2026-09-15T12:00:00+07:00', text: 'private customer text' }], history: [
      { at: '2026-09-15T12:00:00+07:00', field: 'note' },
      { at: '2026-09-15T13:00:00+07:00', field: 'status', from: '', to: 'Đã kết bạn' },
      { at: '2026-09-15T13:01:00+07:00', field: 'status', from: 'Đã kết bạn', to: '' },
      { at: '2026-09-15T13:02:00+07:00', field: 'status', from: '', to: 'Đã kết bạn' },
      { at: '2026-09-15T15:00:00+07:00', field: 'result', from: '', to: 'Đã Chốt' },
      { at: '2026-09-15T18:00:00+07:00', field: 'result', from: 'Đã Chốt', to: '' }
    ] },
    { sale: 'TP8 TUẤN', createdAt: '2026-01-01T08:00:00+07:00', notes: [], history: [{ field: 'adminReply', at: '2026-09-15T14:00:00+07:00' }] }
  ];
  const report = buildReport(rows, accounts, '2026-09-15', '17:30', due + 3600000);
  assert.equal(report.totals.newLeads, 1);
  assert.equal(report.totals.caredLeads, 1);
  assert.equal(report.totals.notes, 1);
  assert.equal(report.totals.friends, 1);
  assert.equal(report.totals.closed, 1);
  assert.equal(report.sales.find(s => s.sale === 'TP8 TUẤN').team, 'Phòng 8');
  assert.equal(report.sales.find(s => s.sale === 'TP8 TUẤN').caredLeads, 0);
  assert.equal(report.sales.reduce((sum, s) => sum + s.newLeads, 0), report.totals.newLeads);
  assert.ok(!report.text.includes('private customer text'));
  assert.equal(buildReport(rows, accounts, '2026-09-15', '17:30', due - 1000).partial, true);
});

test('signature conforms to official HMAC empty-message example and rejects arbitrary URLs', () => {
  assert.deepEqual(payloadFor('hello', 'demo', 100000), { msg_type: 'text', content: { text: 'hello' }, timestamp: '100', sign: 'jquNHnVOwmDRfw+vqTIrY5dooJAgi5EcRtLsQE4wfXg=' });
  assert.equal(validateWebhook(webhookUrl), webhookUrl);
  for (const url of ['http://localhost/x', webhookUrl + '?secret=x', webhookUrl.replace('open.larksuite.com', 'open.larksuite.com.evil.example'), webhookUrl.replace('https://', 'https://user@')]) assert.throws(() => validateWebhook(url));
  const parts = messageParts(Array.from({ length: 300 }, (_, n) => `P5 Sale ${n}: ${'Ghi chú Việt Nam '.repeat(15)}`).join('\n'));
  assert.ok(parts.length > 1);
  for (const part of parts) assert.ok(Buffer.byteLength(JSON.stringify(payloadFor(part, 'test-secret', due))) < 20000);
});

test('scheduler fires at 17:30 Vietnam, persists acknowledgement and does not resend after restart', async t => {
  const f = fixture(t); f.setTime(due - 1000);
  f.service.configure({ enabled: true, webhookUrl, time: '17:30' });
  await f.service.tick(); assert.equal(f.calls.length, 0);
  f.setTime(due); await Promise.all([f.service.tick(), f.service.tick()]);
  assert.equal(f.calls.length, 1); assert.equal(f.service.status().jobs[0].status, 'sent');
  assert.equal(f.calls[0].redirect, 'error');
  assert.equal(JSON.parse(f.calls[0].body).msg_type, 'text');
  await createLarkReporter(f.args).tick(); assert.equal(f.calls.length, 1);
  f.service.queue('2026-09-15'); await f.service.tick(); assert.equal(f.calls.length, 1);
  assert.equal(fs.statSync(path.join(f.directory, 'state.json')).mode & 0o777, 0o600);
});

test('restart catches up missed dates; disabled default sends nothing', async t => {
  const f = fixture(t);
  await f.service.tick(); assert.equal(f.calls.length, 0);
  f.service.configure({ enabled: true, webhookUrl });
  f.setTime(due + 2 * 86400000);
  const restarted = createLarkReporter(f.args);
  await restarted.tick(); await restarted.tick(); await restarted.tick();
  assert.deepEqual(restarted.status().jobs.map(j => j.date), ['2026-09-17', '2026-09-16', '2026-09-15']);
  assert.equal(f.calls.length, 3);
  await restarted.tick(); assert.equal(f.calls.length, 3);
});

test('HTTP 200 with Lark failure code retries; ambiguous delivery awaits manual retry', async t => {
  let outcome = { ok: true, status: 200, json: async () => ({ code: 11232 }) }, calls = 0;
  const f = fixture(t, { fetchImpl: async () => { calls++; if (outcome === 'timeout') throw new Error('timeout'); return outcome; } });
  f.service.configure({ enabled: true, webhookUrl }); await f.service.tick();
  assert.equal(f.service.status().jobs[0].status, 'failed');
  await f.service.tick(); assert.equal(calls, 1);
  f.setTime(due + 120000); outcome = 'timeout'; await f.service.tick();
  assert.equal(f.service.status().jobs[0].status, 'uncertain');
  f.setTime(due + 600000); await f.service.tick(); assert.equal(calls, 2);
  outcome = good(); f.service.queue('2026-09-15', true); await f.service.tick();
  assert.equal(calls, 3); assert.equal(f.service.status().jobs[0].status, 'sent');
});

test('test message does not consume the daily report; secrets never appear in status', async t => {
  const f = fixture(t);
  f.service.configure({ enabled: false, webhookUrl, signingSecret: 'private-secret' });
  assert.equal((await f.service.testConnection()).ok, true);
  assert.equal(f.service.status().jobs.length, 0);
  assert.equal(f.service.status().lastTest.ok, true);
  const status = JSON.stringify(f.service.status());
  assert.ok(!status.includes('private-secret')); assert.ok(!status.includes('12345678-1234'));
  assert.throws(() => f.service.queue('2026-09-16'), /chưa kết thúc/);
  assert.throws(() => f.service.preview('2026-13-42'));
});

test('long report continues after acknowledged parts and does not post twice during concurrent ticks', async t => {
  const f = fixture(t, { readAccounts: () => Array.from({ length: 250 }, (_, n) => ({ role: 'sale', sale: `P5 Sale ${n} ${'Tên dài '.repeat(8)}` })) });
  f.service.configure({ enabled: true, webhookUrl }); await f.service.tick();
  assert.ok(f.service.status().jobs[0].totalParts > 1);
  const firstBody = f.calls[0].body;
  const restarted = createLarkReporter(f.args);
  while (restarted.status().jobs[0].status !== 'sent') await Promise.all([restarted.tick(), restarted.tick()]);
  assert.equal(f.calls.filter(call => call.body === firstBody).length, 1);
  assert.equal(f.calls.length, restarted.status().jobs[0].totalParts);
});

test('pausing the schedule stops queued automatic parts; explicitly requested reports still run', async t => {
  const f = fixture(t, { readAccounts: () => Array.from({ length: 250 }, (_, n) => ({ role: 'sale', sale: `P5 Sale ${n} ${'Tên dài '.repeat(8)}` })) });
  f.service.configure({ enabled: true, webhookUrl }); await f.service.tick();
  assert.equal(f.service.status().jobs[0].status, 'queued');
  f.service.configure({ enabled: false }); await f.service.tick(); assert.equal(f.calls.length, 1);
  f.service.queue('2026-09-14'); await f.service.tick(); assert.equal(f.calls.length, 2);
});

test('queuing during a connection test is preserved when the test response arrives', async t => {
  let acknowledge;
  const f = fixture(t, { fetchImpl: () => new Promise(resolve => { acknowledge = resolve; }) });
  f.service.configure({ enabled: false, webhookUrl });
  const pending = f.service.testConnection();
  f.service.queue('2026-09-15'); acknowledge(good()); await pending;
  assert.equal(f.service.status().jobs.length, 1);
  assert.equal(f.service.status().jobs[0].status, 'queued');
});
