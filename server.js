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
let trackingCache = { value: null, expiresAt: 0 };
const trackingRate = new Map();

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
  const range = `${source.sheetId}!A1:AS${source.maxRows || 10000}`;
  const url = `https://open.larksuite.com/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(source.spreadsheetToken)}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json();
  if (!response.ok || body.code) throw new Error(body.msg || `Không thể đọc sheet Lark ${source.label || ''}.`);
  return (body.data?.valueRange?.values || []).map(row => row.map(value => value == null ? '' : value));
}
async function larkSheets(spreadsheetToken, token) {
  const url = `https://open.larksuite.com/open-apis/sheets/v3/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets/query`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json();
  if (!response.ok || body.code) throw new Error(body.msg || 'Không thể đọc danh sách sheet Lark.');
  return body.data?.sheets || [];
}
async function resolveLarkSource(source, token) {
  if (source.sheetId && !source.sheetTitle) return source;
  const sheetsInFile = await larkSheets(source.spreadsheetToken, token);
  const matched = sheetsInFile.find(sheet => normalized(sheet.title || sheet.name) === normalized(source.sheetTitle));
  if (!matched) throw new Error(`Không tìm thấy tab Lark ${source.sheetTitle}.`);
  return { ...source, sheetId: matched.sheet_id || matched.sheetId, label: source.label || matched.title || matched.name };
}
function normalized(value) {
  return String(value ?? '').trim().toLocaleUpperCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D').replace(/[^A-Z0-9]/g, '');
}
function tableFromRows(rows, requiredHeaders) {
  const headerIndex = rows.findIndex(row => requiredHeaders.every(name => row.some(cellValue => normalized(cellValue) === normalized(name))));
  if (headerIndex < 0) return { cols: [], rows: [] };
  return { cols: rows[headerIndex].map(value => String(value ?? '').trim()), rows: rows.slice(headerIndex + 1).filter(row => row.some(value => String(value ?? '').trim())) };
}
function column(cols, ...names) {
  const normalizedCols = cols.map(normalized);
  for (const name of names) { const index = normalizedCols.findIndex(value => value === normalized(name)); if (index >= 0) return index; }
  for (const name of names) { const index = normalizedCols.findIndex(value => value.includes(normalized(name))); if (index >= 0) return index; }
  return -1;
}
function cell(row, index) { return index >= 0 ? String(row[index] ?? '').trim() : ''; }
function normalizeLarkDateText(text, monthFirstInput) {
  const matched = String(text || '').trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s.*)?$/);
  if (!matched || !monthFirstInput || Number(matched[1]) > 12) return String(text || '').trim();
  return `${Number(matched[2])}/${Number(matched[1])}/${matched[3]}`;
}
function larkDate(value, monthFirstInput = false) {
  if (value == null || value === '') return '';
  if (typeof value === 'number') {
    const milliseconds = value > 1e12 ? value : value > 1e9 ? value * 1000 : value > 20000 ? (value - 25569) * 86400000 : 0;
    if (milliseconds) {
      const rendered = new Date(milliseconds).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      return normalizeLarkDateText(rendered, monthFirstInput);
    }
  }
  const text = String(value).trim();
  return normalizeLarkDateText(text, monthFirstInput);
}
function dateFromVehicle(value) {
  const match = String(value || '').trim().match(/(?:^|[-.])(\d{1,2})[.\/-](\d{1,2})$/);
  return match ? `${match[1]}/${match[2]}/${new Date().getFullYear()}` : '';
}
async function trackingTables() {
  if (trackingCache.value && trackingCache.expiresAt > Date.now()) return trackingCache.value;
  const config = larkConfig();
  if (!config?.sources?.vehicle || !config?.sources?.vehicleTn || !config?.sources?.thuyTn || !config?.sources?.yenTn || !config?.sources?.delivery) throw new Error('Nguồn tra cứu Lark chưa được cấu hình đầy đủ.');
  const token = await larkToken(config);
  const [thuyTnSource, yenTnSource, vehicleSheets, vehicleTnSheets] = await Promise.all([
    resolveLarkSource(config.sources.thuyTn, token), resolveLarkSource(config.sources.yenTn, token),
    larkSheets(config.sources.vehicle.spreadsheetToken, token), larkSheets(config.sources.vehicleTn.spreadsheetToken, token)
  ]);
  const [thuyRows, yenRows, thuyTnRows, yenTnRows, deliveryRows] = await Promise.all([
    larkRows(config.sources.thuy, token), larkRows(config.sources.yen, token),
    larkRows(thuyTnSource, token), larkRows(yenTnSource, token), larkRows(config.sources.delivery, token)
  ]);
  const monthlySources = (sheetsInFile, source) => sheetsInFile.filter(sheet => !sheet.hidden).map(sheet => ({ ...source, sheetId: sheet.sheet_id || sheet.sheetId, label: `${source.label} · ${sheet.title || sheet.name || sheet.sheet_id}` }));
  const vehicleSources = [...monthlySources(vehicleSheets, config.sources.vehicle), ...monthlySources(vehicleTnSheets, config.sources.vehicleTn)];
  const vehicleRows = await Promise.all(vehicleSources.map(source => larkRows(source, token).catch(error => { console.error(`Skip Lark vehicle sheet ${source.label}: ${error.message}`); return []; })));
  const value = {
    warehouses: [thuyRows, yenRows, thuyTnRows, yenTnRows].map(rows => tableFromRows(rows, ['MÃ HÀNG'])),
    vehicles: vehicleRows.map(rows => tableFromRows(rows, ['BIỂN SỐ XE', 'TRẠNG THÁI'])).filter(table => table.cols.length),
    deliveries: tableFromRows(deliveryRows, ['MÃ HÀNG', 'SỐ KIỆN THỰC GIAO']),
    vehicleTabs: vehicleSources.map(source => source.label)
  };
  trackingCache = { value, expiresAt: Date.now() + 120000 };
  return value;
}
async function trackingOrder(code) {
  const data = await trackingTables();
  let found = null;
  for (const [warehouseIndex, table] of data.warehouses.entries()) {
    const codeColumn = column(table.cols, 'MÃ HÀNG');
    const row = table.rows.find(item => normalized(cell(item, codeColumn)) === normalized(code));
    if (row) { found = { table, row, monthFirstDates: warehouseIndex >= 2 }; break; }
  }
  if (!found) return { found: false, code };
  const { table, row, monthFirstDates } = found;
  const officialCode = cell(row, column(table.cols, 'MÃ HÀNG'));
  const entered = larkDate(row[column(table.cols, 'NGÀY/ THÁNG', 'NGÀY THÁNG', 'NGÀY VỀ KHO TQ', 'NGÀY NHẬP KHO', 'NGÀY')], monthFirstDates);
  const vehicle = cell(row, column(table.cols, 'BIỂN SỐ XE/ CỬA KHẨU', 'BIỂN SỐ XE'));
  const loaded = larkDate(row[column(table.cols, 'NGÀY BỐC')], monthFirstDates) || dateFromVehicle(vehicle);
  let vehicleRow = null, vehicleTable = null;
  for (const candidate of data.vehicles) {
    const vehicleColumn = column(candidate.cols, 'BIỂN SỐ XE');
    const match = candidate.rows.find(item => normalized(cell(item, vehicleColumn)) === normalized(vehicle));
    if (match) { vehicleRow = match; vehicleTable = candidate; break; }
  }
  const vehicleStatus = vehicleRow ? cell(vehicleRow, column(vehicleTable.cols, 'TRẠNG THÁI')) : '';
  const customs = normalized(vehicleStatus) === normalized('ĐÃ THÔNG QUAN') ? larkDate(vehicleRow[column(vehicleTable.cols, 'NGÀY THÔNG QUAN')]) : '';
  const hanoi = vehicleRow ? larkDate(vehicleRow[column(vehicleTable.cols, 'NGÀY HẠ KHO HN')]) : '';
  const deliveryCode = column(data.deliveries.cols, 'MÃ HÀNG'), deliveryDate = column(data.deliveries.cols, 'NGÀY'), deliveryPackages = column(data.deliveries.cols, 'SỐ KIỆN THỰC GIAO');
  const deliveries = data.deliveries.rows.filter(item => normalized(cell(item, deliveryCode)) === normalized(officialCode)).map(item => ({ date: larkDate(item[deliveryDate]), packages: cell(item, deliveryPackages) }));
  return { source: 'lark-v3', found: true, code: officialCode, entered, vehicle, loaded, customs, hanoi, deliveries };
}
function allowTrackingOrigin(req, res) {
  const origin = req.headers.origin || '';
  if (['https://kimthanhtinlogistics.vn', 'https://www.kimthanhtinlogistics.vn'].includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
}
function trackingRateAllowed(req) {
  const key = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(), now = Date.now(), current = trackingRate.get(key);
  if (!current || current.resetAt < now) { trackingRate.set(key, { count: 1, resetAt: now + 60000 }); return true; }
  current.count += 1;
  return current.count <= 60;
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
  if (pathname === '/api/tracking' && req.method === 'GET') {
    allowTrackingOrigin(req, res);
    if (!trackingRateAllowed(req)) return send(res, 429, { error: 'Bạn đang tra cứu quá nhanh. Vui lòng thử lại sau ít phút.' });
    const code = String(new URL(req.url, 'https://hethong.kimthanhtinlogistics.vn').searchParams.get('code') || '').trim();
    if (!/^[A-Za-z0-9._-]{4,40}$/.test(code)) return send(res, 400, { error: 'Mã hàng không hợp lệ.' });
    try { return send(res, 200, await trackingOrder(code)); }
    catch (error) { console.error(`Tracking API failed: ${error.message}`); return send(res, 502, { error: 'Chưa thể đồng bộ dữ liệu Lark.' }); }
  }
  if (pathname === '/api/tracking-health' && req.method === 'GET') {
    try {
      const data = await trackingTables();
      return send(res, 200, { ok: true, source: 'lark-v3', warehouses: data.warehouses.map(table => table.rows.length), vehicleTabs: data.vehicleTabs, vehicleRows: data.vehicles.map(table => table.rows.length), deliveries: data.deliveries.rows.length });
    } catch (error) { return send(res, 502, { ok: false, error: error.message }); }
  }
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
