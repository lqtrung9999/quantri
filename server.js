const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const usersFile = path.join(__dirname, 'users.json');
const crmConfigFile = path.join(__dirname, 'crm-config.json');
const larkConfigFile = path.join(__dirname, 'lark-config.json');
const port = Number(process.env.PORT || 3000);
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const sheetId = '1CM0In02I0TeN7lxY20G3hEHpU9uJAmGo187opGDzDB4';
const sheets = {
  thuy: { debt: 'Công Nợ KH KT Thuỷ', warehouse: 'Hàng vào kho TQ KT Thuỷ' },
  yen: { debt: 'Công Nợ KH KT Yến', warehouse: 'Hàng vào kho TQ KT Yến' }
};
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
let larkTokenCache = { value: '', expiresAt: 0 };

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
}

function users() { return JSON.parse(fs.readFileSync(usersFile, 'utf8')); }
function crmConfig() {
  if (!fs.existsSync(crmConfigFile)) throw new Error('CRM chưa được cấu hình.');
  const config = JSON.parse(fs.readFileSync(crmConfigFile, 'utf8'));
  if (!config.url || !config.key) throw new Error('CRM chưa được cấu hình.');
  return config;
}
function larkConfig() {
  if (!fs.existsSync(larkConfigFile)) return null;
  const config = JSON.parse(fs.readFileSync(larkConfigFile, 'utf8'));
  if (!config.appId || !config.appSecret || !config.sources?.thuy || !config.sources?.yen) return null;
  return config;
}
async function crmRequest(method, action, record) {
  const config = crmConfig();
  const url = new URL(config.url);
  if (method === 'GET') url.searchParams.set('key', config.key);
  const response = await fetch(url, method === 'GET' ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: config.key, action, record })
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Không thể kết nối CRM.');
  return data;
}
async function crmBatchUpdate(records) {
  const config = crmConfig();
  const response = await fetch(config.url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: config.key, action: 'batchUpdate', records })
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Không thể lưu CRM.');
  return data;
}
function sameSale(left, right) { return String(left || '').trim().toLocaleLowerCase('vi-VN') === String(right || '').trim().toLocaleLowerCase('vi-VN'); }
function saveUsers(list) {
  const temporary = `${usersFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(list, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, usersFile);
}
function hash(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }
function verifyPassword(password, stored) {
  const [, salt, expected] = stored.split('$');
  const actual = hash(password, salt);
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
function sign(value) { return crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url'); }
function makeSession(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function currentUser(req) {
  const cookie = Object.fromEntries((req.headers.cookie || '').split(';').map(v => v.trim().split('=').map(decodeURIComponent)).filter(v => v.length === 2));
  const token = cookie.ktt_session;
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || signature.length !== sign(payload).length || !crypto.timingSafeEqual(Buffer.from(sign(payload)), Buffer.from(signature))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.exp > Date.now() ? users().find(user => user.id === session.id && user.active !== false) || null : null;
  } catch { return null; }
}
function profile(user) { return { id: user.id, name: user.name, role: user.role, sale: user.sale || null }; }
function readJson(req) { return new Promise((resolve, reject) => { let body = ''; req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); }); req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Dữ liệu không hợp lệ')); } }); req.on('error', reject); }); }
function googleRows(sheet) {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${encodeURIComponent(sheet)}&tqx=out:json`;
    https.get(url, response => { let data = ''; response.on('data', chunk => data += chunk); response.on('end', () => {
      try {
        const result = JSON.parse(data.match(/setResponse\((.*)\);?$/s)[1]);
        const value = cell => {
          if (!cell) return null;
          const date = String(cell.v || '').match(/^Date\((\d+),(\d+),(\d+)\)$/);
          if (date) return `${String(date[3]).padStart(2, '0')}/${String(Number(date[2]) + 1).padStart(2, '0')}/${date[1]}`;
          return cell.f ?? cell.v;
        };
        resolve((result.table.rows || []).map(row => (row.c || []).map(value)));
      } catch { reject(new Error(`Không đọc được sheet ${sheet}`)); }
    }); }).on('error', reject);
  });
}
async function larkToken(config) {
  if (larkTokenCache.value && larkTokenCache.expiresAt > Date.now()) return larkTokenCache.value;
  const response = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret })
  });
  const body = await response.json();
  if (!response.ok || body.code || !body.tenant_access_token) throw new Error(body.msg || 'Không thể xác thực Lark API.');
  larkTokenCache = {
    value: body.tenant_access_token,
    expiresAt: Date.now() + Math.max(60, Number(body.expire || 7200) - 60) * 1000
  };
  return larkTokenCache.value;
}
async function larkRows(source, token) {
  const range = `${source.sheetId}!A1:AS5000`;
  const url = `https://open.larksuite.com/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(source.spreadsheetToken)}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json();
  if (!response.ok || body.code) throw new Error(body.msg || `Không thể đọc sheet Lark ${source.label || ''}.`);
  return (body.data?.valueRange?.values || []).map(row => row.map(value => value == null ? '' : value));
}
async function warehouseData() {
  const config = larkConfig();
  if (!config) return Promise.all([googleRows(sheets.thuy.warehouse), googleRows(sheets.yen.warehouse)]);
  try {
    const token = await larkToken(config);
    return await Promise.all([larkRows(config.sources.thuy, token), larkRows(config.sources.yen, token)]);
  } catch (error) {
    console.error(`Lark warehouse sync failed: ${error.message}`);
    return Promise.all([googleRows(sheets.thuy.warehouse), googleRows(sheets.yen.warehouse)]);
  }
}
async function dashboardData(user) {
  const [[debtThuy, debtYen], [warehouseThuy, warehouseYen]] = await Promise.all([
    Promise.all([googleRows(sheets.thuy.debt), googleRows(sheets.yen.debt)]),
    warehouseData()
  ]);
  if (user.role === 'sale') {
    const allowedSales = [user.sale, ...(user.saleAliases || [])]
      .map(value => String(value || '').trim().toLocaleLowerCase('vi-VN'))
      .filter(Boolean);
    const filterSale = rows => rows.filter(row => allowedSales.includes(String(row[8] || '').trim().toLocaleLowerCase('vi-VN')));
    return { thuy: { debt: [], warehouse: filterSale(warehouseThuy) }, yen: { debt: [], warehouse: filterSale(warehouseYen) } };
  }
  return { thuy: { debt: debtThuy, warehouse: warehouseThuy }, yen: { debt: debtYen, warehouse: warehouseYen } };
}

http.createServer(async (req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const { username, password } = await readJson(req);
      const user = users().find(item => item.username.toLowerCase() === String(username || '').trim().toLowerCase() && item.active !== false);
      if (!user || !verifyPassword(String(password || ''), user.passwordHash)) return send(res, 401, { error: 'Tên đăng nhập hoặc mật khẩu chưa đúng.' });
      res.setHeader('Set-Cookie', `ktt_session=${makeSession(user)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
      return send(res, 200, { user: profile(user) });
    } catch { return send(res, 400, { error: 'Không thể đăng nhập.' }); }
  }
  if (pathname === '/api/logout' && req.method === 'POST') { res.setHeader('Set-Cookie', 'ktt_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return send(res, 200, { ok: true }); }
  if (pathname === '/logo-kim-thanh-tin-transparent.png') {
    return fs.readFile(path.join(publicDir, 'logo-kim-thanh-tin-transparent.png'), (error, content) => error ? send(res, 404, 'Không tìm thấy logo.', 'text/plain; charset=utf-8') : send(res, 200, content, 'image/png'));
  }
  const user = currentUser(req);
  if (pathname === '/api/change-password' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
    try {
      const { currentPassword, newPassword } = await readJson(req);
      if (!verifyPassword(String(currentPassword || ''), user.passwordHash)) return send(res, 400, { error: 'Mật khẩu hiện tại chưa đúng.' });
      if (typeof newPassword !== 'string' || newPassword.length < 8) return send(res, 400, { error: 'Mật khẩu mới cần có ít nhất 8 ký tự.' });
      const list = users();
      const account = list.find(item => item.id === user.id);
      if (!account) return send(res, 404, { error: 'Không tìm thấy tài khoản.' });
      const salt = crypto.randomBytes(16).toString('hex');
      account.passwordHash = `scrypt$${salt}$${hash(newPassword, salt)}`;
      saveUsers(list);
      res.setHeader('Set-Cookie', `ktt_session=${makeSession(account)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
      return send(res, 200, { ok: true });
    } catch { return send(res, 400, { error: 'Không thể đổi mật khẩu.' }); }
  }
  if (pathname === '/api/leads' && req.method === 'GET') {
    if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
    try {
      const data = await crmRequest('GET');
      const rows = user.role === 'sale' ? data.rows.filter(row => sameSale(row.sale, user.sale)) : data.rows;
      return send(res, 200, { rows });
    } catch (error) { return send(res, 502, { error: error.message || 'Không thể tải CRM.' }); }
  }
  if (pathname === '/api/leads' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
    if (user.role !== 'sale') return send(res, 403, { error: 'Chỉ tài khoản Sale có thể cập nhật CRM.' });
    try {
      const { action, record, records } = await readJson(req);
      if (action === 'batchUpdate') {
        if (!Array.isArray(records) || !records.length || records.length > 200) return send(res, 400, { error: 'Danh sách cập nhật không hợp lệ.' });
        const data = await crmRequest('GET');
        const existing = new Map(data.rows.map(row => [row.id, row]));
        for (const item of records) {
          if (!item?.id || !existing.has(item.id) || !sameSale(existing.get(item.id).sale, user.sale)) return send(res, 403, { error: 'Bạn chỉ có thể sửa khách hàng của mình.' });
        }
        return send(res, 200, await crmBatchUpdate(records.map(item => ({ ...item, sale: user.sale }))));
      }
      if (!['create', 'update'].includes(action) || !record) return send(res, 400, { error: 'Dữ liệu CRM không hợp lệ.' });
      if (action === 'update') {
        const data = await crmRequest('GET');
        const existing = data.rows.find(row => row.id === record.id);
        if (!existing || !sameSale(existing.sale, user.sale)) return send(res, 403, { error: 'Bạn chỉ có thể sửa khách hàng của mình.' });
      }
      const saved = await crmRequest('POST', action, { ...record, sale: user.sale });
      return send(res, 200, saved);
    } catch (error) { return send(res, 502, { error: error.message || 'Không thể lưu CRM.' }); }
  }
  if (pathname === '/api/session') return user ? send(res, 200, { user: profile(user) }) : send(res, 401, { error: 'Chưa đăng nhập.' });
  if (pathname === '/api/data') { if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' }); try { return send(res, 200, { user: profile(user), data: await dashboardData(user) }); } catch { return send(res, 502, { error: 'Không thể tải dữ liệu Dashboard.' }); } }
  if (pathname === '/login' && !user) return fs.readFile(path.join(publicDir, 'login.html'), (error, content) => error ? send(res, 500, 'Không thể tải trang đăng nhập.', 'text/plain; charset=utf-8') : send(res, 200, content, 'text/html; charset=utf-8'));
  if (!user) { res.writeHead(302, { Location: '/login' }); return res.end(); }
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(publicDir, relativePath);
  if (!filePath.startsWith(`${publicDir}${path.sep}`) && filePath !== path.join(publicDir, 'index.html')) return send(res, 403, 'Không được phép truy cập tệp này.', 'text/plain; charset=utf-8');
  fs.readFile(filePath, (error, content) => error ? send(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Không tìm thấy trang.' : 'Không thể tải trang.', 'text/plain; charset=utf-8') : send(res, 200, content, types[path.extname(filePath).toLowerCase()] || 'application/octet-stream'));
}).listen(port, () => console.log(`Dashboard đang chạy tại http://localhost:${port}`));
