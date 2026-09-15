const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DAY = 86400000;
const ZONE = 'Asia/Ho_Chi_Minh';
const OFFSET = 7 * 3600000;
const METRICS = ['newLeads', 'caredLeads', 'notes', 'friendRequests', 'friends', 'interactions', 'consulted', 'closed', 'notClosed'];
const emptyMetrics = () => Object.fromEntries(METRICS.map(key => [key, 0]));
const normalize = value => String(value || '').trim().toLocaleUpperCase('vi-VN');
const cleanLabel = value => String(value || '').replace(/[\r\n<>]/g, ' ').slice(0, 120);
const vnDate = instant => new Date(Number(instant) + OFFSET).toISOString().slice(0, 10);
const shiftDate = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}
function period(date, time = '17:30') {
  if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Ngày hoặc giờ báo cáo không hợp lệ.');
  const end = Date.parse(`${date}T${time}:00+07:00`);
  return { start: end - DAY, end };
}
function teamFor(sale) {
  const match = normalize(sale).match(/^(?:TP|P)(\d+)(?=\D|$)/);
  return match ? `Phòng ${match[1]}` : 'Chưa xác định phòng';
}
function valueAt(row, field, cutoff) {
  let value = row[field] || '';
  const later = (row.history || []).filter(event => event.field === field && Date.parse(event.at) >= cutoff).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  for (const event of later) value = event.from || '';
  return value;
}

// A full 24-hour window includes work done after yesterday's delivery.
// Count customers, not repeated status toggles, and exclude Admin replies from sale activity.
function buildReport(rows, accounts, date, time = '17:30', now = Date.now()) {
  const { start, end } = period(date, time), sales = new Map();
  const inside = at => Date.parse(at) >= start && Date.parse(at) < Math.min(end, now);
  const saleRow = sale => {
    const key = normalize(sale) || 'CHƯA PHÂN CÔNG';
    if (!sales.has(key)) sales.set(key, { sale: cleanLabel(sale || 'Chưa phân công'), team: teamFor(sale), ...emptyMetrics() });
    return sales.get(key);
  };
  for (const account of accounts) if (account.active !== false && account.role === 'sale') saleRow(account.sale || account.name);
  let legacyDates = 0;
  for (const row of rows) {
    const createdAt = row.createdAt || (row.foundAt ? `${row.foundAt}T00:00:00+07:00` : '');
    const events = (row.history || []).filter(event => inside(event.at));
    const notes = (row.notes || []).filter(note => inside(note.at));
    const newLead = inside(createdAt);
    const cared = notes.length > 0 || events.some(event => ['status', 'category', 'result', 'note'].includes(event.field));
    if (!newLead && !cared) continue;
    if (!row.createdAt && newLead) legacyDates++;
    const summary = saleRow(row.sale);
    if (newLead) summary.newLeads++;
    if (cared) summary.caredLeads++;
    summary.notes += notes.length;
    for (const [metric, status] of Object.entries({ friendRequests: 'Đã gửi lời mời kết bạn', friends: 'Đã kết bạn', interactions: 'Khách đã tương tác', consulted: 'Đã tư vấn dịch vụ' })) {
      if (events.some(event => event.field === 'status' && event.to === status)) summary[metric]++;
    }
    for (const [metric, result] of Object.entries({ closed: 'Đã Chốt', notClosed: 'Chưa Chốt Được' })) {
      if (events.some(event => event.field === 'result' && event.to === result) && valueAt(row, 'result', Math.min(end, now)) === result) summary[metric]++;
    }
  }
  const list = [...sales.values()].sort((a, b) => a.team.localeCompare(b.team, 'vi', { numeric: true }) || a.sale.localeCompare(b.sale, 'vi'));
  const totals = emptyMetrics(), teams = new Map();
  for (const sale of list) {
    if (!teams.has(sale.team)) teams.set(sale.team, { team: sale.team, ...emptyMetrics() });
    for (const metric of METRICS) { totals[metric] += sale[metric]; teams.get(sale.team)[metric] += sale[metric]; }
  }
  const format = instant => new Date(instant).toLocaleString('vi-VN', { timeZone: ZONE, dateStyle: 'short', timeStyle: 'short' });
  const lines = [
    `KTT · BÁO CÁO CRM MỚI · ${date.split('-').reverse().join('/')}`,
    `Kỳ: ${format(start)} → ${format(end)} (giờ Việt Nam)`,
    ...(now < end ? [`XEM TRƯỚC — số liệu đến ${format(now)}, chưa hết kỳ.`] : []),
    '', 'TỔNG TOÀN CÔNG TY',
    `Data mới: ${totals.newLeads} | Khách được chăm sóc: ${totals.caredLeads} | Ghi chú: ${totals.notes}`,
    `Gửi kết bạn: ${totals.friendRequests} | Đã kết bạn: ${totals.friends}`,
    `Khách tương tác: ${totals.interactions} | Đã tư vấn: ${totals.consulted}`,
    `Chốt trong kỳ: ${totals.closed} | Chưa chốt được trong kỳ: ${totals.notClosed}`, ''
  ];
  const line = (label, row) => `${label}: ${row.newLeads} mới · ${row.caredLeads} chăm sóc · ${row.notes} ghi chú · ${row.closed} chốt · ${row.notClosed} chưa chốt`;
  for (const team of teams.values()) {
    lines.push(line(team.team.toLocaleUpperCase('vi-VN'), team));
    for (const sale of list.filter(row => row.team === team.team)) lines.push(line(`  ${sale.sale}`, sale));
    lines.push('');
  }
  lines.push('Chăm sóc = khách có ghi chú hoặc đổi Zalo/phân loại/kết quả trong kỳ. Kết quả đếm khách đổi kết quả trong kỳ và còn giữ kết quả đó tại giờ chốt báo cáo.');
  if (legacyDates) lines.push(`${legacyDates} hồ sơ cũ thiếu giờ tạo: tạm dùng 00:00 ngày tạo.`);
  lines.push('Chi tiết: https://hethong.kimthanhtinlogistics.vn/crm-new.html');
  return { date, time, start: new Date(start).toISOString(), end: new Date(end).toISOString(), partial: now < end, totals, teams: [...teams.values()], sales: list, text: lines.join('\n') };
}

function validateWebhook(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('URL webhook Lark không hợp lệ.'); }
  if (url.protocol !== 'https:' || !['open.larksuite.com', 'open.feishu.cn'].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !/^\/open-apis\/bot\/v2\/hook\/[a-zA-Z0-9-]{16,128}$/.test(url.pathname)) {
    throw new Error('Chỉ nhận webhook Custom Bot HTTPS chính thức của Lark/Feishu.');
  }
  return url.href;
}
function payloadFor(text, secret, now) {
  const payload = { msg_type: 'text', content: { text } };
  if (secret) {
    payload.timestamp = String(Math.floor(now / 1000));
    payload.sign = crypto.createHmac('sha256', `${payload.timestamp}\n${secret}`).update('').digest('base64');
  }
  return payload;
}
function messageParts(text) {
  const chunks = []; let chunk = '';
  for (const line of text.split('\n')) {
    // Leaves room for JSON escaping, the signature and the part header (20 KB Lark limit).
    if (Buffer.byteLength(JSON.stringify(chunk + '\n' + line)) > 12000 && chunk) { chunks.push(chunk); chunk = ''; }
    chunk += (chunk ? '\n' : '') + line;
  }
  if (chunk) chunks.push(chunk);
  return chunks.map((part, index) => chunks.length > 1 ? `KTT · CRM Mới (${index + 1}/${chunks.length})\n${part}` : part);
}

function createLarkReporter({ directory, readRows, readAccounts, fetchImpl = fetch, clock = Date.now }) {
  const file = path.join(directory, 'state.json');
  const initial = { config: { enabled: false, time: '17:30', webhookUrl: '', signingSecret: '', startDate: '' }, jobs: {}, lastTest: null };
  function read() {
    if (!fs.existsSync(file)) return structuredClone(initial);
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!state.config || !state.jobs) throw new Error('Dữ liệu cấu hình báo cáo Lark không hợp lệ.');
    return state;
  }
  function save(state) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(`${file}.tmp`, file);
  }
  let busy = false, timer;
  function status() {
    const { config, jobs, lastTest } = read();
    return {
      configured: Boolean(config.webhookUrl), enabled: config.enabled, time: config.time, timezone: ZONE,
      webhookHost: config.webhookUrl ? new URL(config.webhookUrl).hostname : '', signed: Boolean(config.signingSecret), startDate: config.startDate,
      lastTest, busy,
      jobs: Object.values(jobs).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(({ parts, ...job }) => ({ ...job, totalParts: parts.length }))
    };
  }
  function configure(input) {
    if (busy) throw new Error('Đang gửi báo cáo; vui lòng chờ gửi xong trước khi đổi cấu hình.');
    const state = read(), config = state.config;
    if (input.webhookUrl) {
      const nextUrl = validateWebhook(String(input.webhookUrl).trim());
      if (nextUrl !== config.webhookUrl && Object.values(state.jobs).some(job => ['queued', 'failed', 'sending', 'uncertain'].includes(job.status))) throw new Error('Còn báo cáo chờ gửi. Hoàn tất các báo cáo này trước khi đổi nhóm nhận.');
      config.webhookUrl = nextUrl;
    }
    if (input.clearSecret === true) config.signingSecret = '';
    else if (typeof input.signingSecret === 'string' && input.signingSecret.trim()) config.signingSecret = input.signingSecret.trim().slice(0, 256);
    if (input.time !== undefined) {
      if (typeof input.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error('Giờ gửi phải có dạng HH:mm.');
      config.time = input.time;
    }
    if (typeof input.enabled !== 'boolean') throw new Error('Vui lòng chọn bật hoặc tắt báo cáo tự động.');
    if (input.enabled && !config.webhookUrl) throw new Error('Cần nhập URL webhook trước khi bật báo cáo.');
    if (input.enabled && !config.enabled) config.startDate = vnDate(clock());
    config.enabled = input.enabled;
    save(state); return status();
  }
  function preview(date) {
    const config = read().config;
    return buildReport(readRows(), readAccounts(), date || vnDate(clock()), config.time, clock());
  }
  function queue(date, retry = false, manual = true) {
    const state = read();
    if (!state.config.webhookUrl) throw new Error('Chưa cấu hình webhook Lark.');
    const reportPeriod = period(date, state.config.time);
    if (reportPeriod.end > clock()) throw new Error('Kỳ báo cáo chưa kết thúc. Bạn có thể xem trước và gửi sau giờ đã chọn.');
    const existing = state.jobs[date];
    if (existing) {
      if (retry && ['failed', 'uncertain'].includes(existing.status) && !busy) { existing.status = 'queued'; existing.manual = manual; existing.attempts = 0; existing.nextAttemptAt = ''; save(state); }
      return status();
    }
    const report = preview(date);
    state.jobs[date] = { date, time: state.config.time, manual, status: 'queued', createdAt: new Date(clock()).toISOString(), sentAt: '', attempts: 0, nextAttemptAt: '', nextPart: 0, error: '', parts: messageParts(report.text) };
    save(state); return status();
  }
  async function post(text, config) {
    const body = JSON.stringify(payloadFor(text, config.signingSecret, clock()));
    if (Buffer.byteLength(body) > 20000) return { ok: false, uncertain: false, error: 'Báo cáo vượt giới hạn dung lượng Lark.' };
    let response, result;
    try {
      response = await fetchImpl(validateWebhook(config.webhookUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(15000), redirect: 'error' });
      result = await response.json();
    } catch {
      return { ok: false, uncertain: true, error: 'Chưa xác nhận Lark đã nhận (mất kết nối hoặc hết thời gian chờ). Kiểm tra nhóm Lark trước khi thử gửi lại.' };
    }
    const code = result?.code ?? result?.StatusCode;
    if (response.ok && (code === 0 || code === '0')) return { ok: true };
    if (code !== undefined || response.status === 429) return { ok: false, uncertain: false, error: `Lark từ chối tin nhắn (HTTP ${response.status}, mã ${Number.isFinite(Number(code)) ? Number(code) : 'không có'}). Kiểm tra webhook, chữ ký, từ khóa KTT và giới hạn gửi.` };
    return { ok: false, uncertain: true, error: 'Lark trả kết quả không xác định. Kiểm tra nhóm trước khi thử lại.' };
  }
  async function testConnection() {
    if (busy) throw new Error('Đang gửi báo cáo. Vui lòng thử lại sau.');
    const state = read();
    if (!state.config.webhookUrl) throw new Error('Hãy lưu URL webhook trước.');
    busy = true;
    try {
      const result = await post(`KTT · KIỂM TRA KẾT NỐI CRM MỚI\nWebhook đã kết nối. Giờ báo cáo: ${state.config.time} hằng ngày (giờ Việt Nam).`, state.config);
      const latest = read(); latest.lastTest = { ...result, at: new Date(clock()).toISOString() }; save(latest);
      return result;
    } finally { busy = false; }
  }
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      let state = read();
      if (state.config.enabled && state.config.webhookUrl) {
        const today = vnDate(clock());
        const lastDue = period(today, state.config.time).end <= clock() ? today : shiftDate(today, -1);
        // Catch up after restarts; process at most one newly due day per tick.
        for (let date = state.config.startDate || today; date <= lastDue; date = shiftDate(date, 1)) {
          if (!state.jobs[date]) { queue(date, false, false); break; }
        }
      }
      state = read();
      const job = Object.values(state.jobs).sort((a, b) => a.date.localeCompare(b.date)).find(item => (item.status === 'queued' && (state.config.enabled || item.manual)) || (state.config.enabled && item.status === 'failed' && item.attempts < 5 && Date.parse(item.nextAttemptAt) <= clock()));
      if (!job || !state.config.webhookUrl) return;
      job.status = 'sending'; job.attempts++; save(state);
      // One part per tick respects Lark throttling. Acknowledged parts are never sent again.
      const result = await post(job.parts[job.nextPart], state.config);
      state = read();
      const current = state.jobs[job.date];
      if (result.ok) {
        current.nextPart++; current.error = ''; current.attempts = 0;
        current.status = current.nextPart === current.parts.length ? 'sent' : 'queued';
        if (current.status === 'sent') current.sentAt = new Date(clock()).toISOString();
      } else {
        current.status = result.uncertain ? 'uncertain' : 'failed'; current.error = result.error;
        current.nextAttemptAt = new Date(clock() + Math.min(30, 2 ** current.attempts) * 60000).toISOString();
      }
      save(state);
    } finally { busy = false; }
  }
  function start() {
    if (timer) return;
    // An interrupted POST may have arrived; preserve this fact for Admin rather than duplicating it.
    try {
      const state = read(); let changed = false;
      for (const job of Object.values(state.jobs)) if (job.status === 'sending') { job.status = 'uncertain'; job.error = 'Máy chủ khởi động lại khi đang gửi. Kiểm tra nhóm Lark trước khi gửi lại.'; changed = true; }
      if (changed) save(state);
    } catch { console.error('CRM Lark: không đọc được trạng thái, cần Admin kiểm tra cấu hình.'); }
    const safeTick = () => tick().catch(() => console.error('CRM Lark: không thể xử lý báo cáo; kiểm tra file cấu hình/trạng thái.'));
    timer = setInterval(safeTick, 30000); timer.unref();
    safeTick();
  }
  return { configure, status, preview, queue, tick, testConnection, start, stop: () => { clearInterval(timer); timer = null; } };
}

module.exports = { createLarkReporter, buildReport, period, payloadFor, messageParts, validateWebhook, vnDate };
