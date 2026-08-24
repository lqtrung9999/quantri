const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = __dirname;
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-new-test-'));
const port = 32179;
let server;

function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
async function request(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  const body = await response.json();
  return { response, body };
}
async function login(username) {
  const { response } = await request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'test-password' }) });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}
async function crm(cookie, method = 'GET', body) {
  return request('/api/crm-new/leads', { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
async function waitUntilReady() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/login`)).status) return; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Test server did not start.');
}

(async () => {
  fs.copyFileSync(path.join(root, 'server.js'), path.join(fixture, 'server.js'));
  fs.mkdirSync(path.join(fixture, 'public'));
  const accounts = [
    ['sale-p5', 'Sale P5', 'sale.p5', 'sale', 'P5 LAN'],
    ['sale-p8', 'Sale P8', 'sale.p8', 'sale', 'P8 HOA'],
    ['manager-p5', 'TP5 THẮM', 'manager.p5', 'sale', 'TP5 THẮM'],
    ['admin', 'Admin', 'admin', 'admin'],
    ['accountant', 'Kế toán', 'accountant', 'accountant']
  ].map(([id, name, username, role, sale]) => ({ id, name, username, role, sale, passwordHash: passwordHash('test-password') }));
  fs.writeFileSync(path.join(fixture, 'users.json'), JSON.stringify(accounts));
  server = spawn(process.execPath, ['server.js'], { cwd: fixture, env: { ...process.env, PORT: String(port), SESSION_SECRET: 'crm-new-integration-test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitUntilReady();

  const [saleP5, saleP8, managerP5, admin, accountant] = await Promise.all(['sale.p5', 'sale.p8', 'manager.p5', 'admin', 'accountant'].map(login));
  const created = await crm(saleP5, 'POST', { action: 'create', record: { name: 'Khách A', phone: '0901', source: 'Facebook', product: 'Vải', link: 'https://example.com', note: 'Ghi chú đầu' } });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.record.history.length, 2);
  assert.equal(created.body.record.zaloTimeline[0].label, 'Chưa cập nhật');
  const id = created.body.record.id;

  const updated = await crm(saleP5, 'POST', { action: 'update', record: { id, name: 'Không được đổi', phone: '0902', source: 'TikTok', product: 'Giày', link: 'https://example.org', status: 'Đã kết bạn', category: 'Khách tiềm năng', result: 'Chưa Chốt Được', note: 'Ghi chú sau' } });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.record.name, 'Khách A');
  assert.equal(updated.body.record.phone, '0902');
  assert.equal(updated.body.record.notes.length, 2);
  assert.equal(updated.body.record.zaloTimeline.length, 2);
  assert.ok(updated.body.record.history.some(change => change.field === 'phone' && change.from === '0901' && change.to === '0902'));

  assert.equal((await crm(saleP8)).body.rows.length, 0, 'Sale khác phòng không được xem khách');
  assert.equal((await crm(managerP5)).body.rows.length, 1, 'Trưởng phòng được xem khách trong phòng');
  assert.equal((await crm(managerP5, 'POST', { action: 'update', record: { id, phone: '0999' } })).response.status, 403, 'Trưởng phòng chỉ xem khách của phòng');
  assert.equal((await crm(admin)).body.rows.length, 1, 'Admin được xem toàn bộ');
  assert.equal((await crm(accountant)).body.rows.length, 1, 'Kế toán được xem toàn bộ');
  assert.equal((await crm(admin, 'POST', { action: 'update', record: { id, phone: '0999' } })).response.status, 403, 'Admin không sửa dữ liệu sale');
  console.log('CRM Mới: 12 kiểm tra API và phân quyền đã đạt.');
  if (process.env.CRM_TEST_BROWSER === '1') {
    console.log(`Giữ máy chủ kiểm thử tại http://127.0.0.1:${port}`);
    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (server) server.kill('SIGTERM');
  fs.rmSync(fixture, { recursive: true, force: true });
});
