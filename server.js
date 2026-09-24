const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ExcelJS = require('exceljs');
const { buildCustomsWorkbook } = require('./customs-excel-export');
const { createLarkReporter } = require('./crm-new-lark-report');

const publicDir = path.join(__dirname, 'public');
const usersFile = path.join(__dirname, 'users.json');
const customsStaffSeedFile = path.join(__dirname, 'customs-staff-seed.json');
const dashboardStaffSeedFile = path.join(__dirname, 'dashboard-staff-seed.json');
const crmNewDataFile = path.join(__dirname, 'crm-new-data.json');
const crmNewSyncConfigFile = path.join(__dirname, 'crm-new-sync-config.json');
const accountingDemoDataFile = path.join(__dirname, 'accounting-entry-demo.json');
const customerManagementDataFile = path.join(__dirname, 'customer-management-data.json');
const customsDataFile = path.join(__dirname, 'customs-coordination-data.json');
const customsSettingsFile = path.join(__dirname, 'customs-settings.json');
const customsDataEpoch = 'warehouse-test-launch-2026-09-14';
const customsReferenceFile = path.join(__dirname, 'customs-declared-goods.json');
const customsExcelTemplateFile = path.join(publicDir, 'modules', 'ktt-customs', 'templates', 'ecus-customs-template.xlsx');
const larkConfigFile = path.join(__dirname, 'lark-config.json');
const port = Number(process.env.PORT || 3000);
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
let larkTokenCache = { value: '', expiresAt: 0 };
let trackingCache = { value: null, expiresAt: 0 };
let customsWarehouseSyncCache = { expiresAt: 0 };
const trackingRate = new Map();
let crmNewSyncState = { configured: false, ok: false, pending: false, pendingSince: '', updatedAt: '', error: '' };
let crmNewSyncPromise = null;
const saleExcelUploads = new Map();
const saleExcelUploadDir = path.join(__dirname, 'logs', 'sale-excel-uploads');
const saleExcelMaxBytes = 500 * 1024 * 1024;
const saleExcelChunkBytes = 1024 * 1024;
const saleImageUploads = new Map();
const saleImageUploadDir = path.join(__dirname, 'logs', 'sale-image-uploads');
// User-uploaded product images are data, not release assets.  Keep them outside
// `public` so deployments cannot remove them with rsync --delete.
const saleImagePublicDir = path.join(__dirname, 'logs', 'customs-sale-images');
const legacySaleImagePublicDir = path.join(publicDir, 'uploads', 'customs-sale-images');
const saleImageMaxBytes = 8 * 1024 * 1024;
const saleImageChunkBytes = 768 * 1024;
const crmLarkReporter = createLarkReporter({
  directory: path.join(__dirname, 'crm-new-lark-private'),
  readRows: crmNewRows,
  readAccounts: () => users().map(account => ({ ...account, role: canonicalUserRole(account) }))
});

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
}
function sendFrameAsset(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN' });
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
}
function readRaw(req, maximumBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > maximumBytes) { reject(new Error('Phần tải lên vượt quá dung lượng cho phép.')); req.destroy(); return; } chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function excelCellText(value) {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value).trim();
  if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('').trim();
  if (value.result != null) return String(value.result).trim();
  if (value.text != null) return String(value.text).trim();
  return '';
}
function importedImageType(extension) {
  const normalizedExtension = String(extension || '').toLowerCase().replace(/^\./, '');
  if (normalizedExtension === 'jpg' || normalizedExtension === 'jpeg') return { extension: '.jpg', mimeType: 'image/jpeg' };
  if (normalizedExtension === 'png') return { extension: '.png', mimeType: 'image/png' };
  if (normalizedExtension === 'webp') return { extension: '.webp', mimeType: 'image/webp' };
  return null;
}
async function saleExcelImagesByRow(filePath) {
  const imagesBySheetRow = new Map();
  try {
    // WorkbookReader đọc dữ liệu chữ tuần tự. ExcelJS chỉ cung cấp vị trí ảnh
    // khi tải workbook đầy đủ, nên chỉ dùng lượt đọc này để lấy ảnh nhúng.
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const media = new Map((workbook.model.media || []).map(item => [item.index, item]));
    for (const worksheet of workbook.worksheets) {
      for (const image of worksheet.getImages?.() || []) {
        const mediaItem = media.get(image.imageId), type = importedImageType(mediaItem?.extension);
        const buffer = mediaItem?.buffer;
        if (!type || !buffer || !buffer.length || buffer.length > saleImageMaxBytes) continue;
        const top = image.range?.tl || {}, bottom = image.range?.br || top;
        const startRow = Math.max(1, Math.floor(Number(top.nativeRow ?? top.row ?? -1)) + 1);
        const endRow = Math.max(startRow, Math.floor(Number(bottom.nativeRow ?? bottom.row ?? startRow - 1)) + 1);
        const startColumn = Math.max(0, Math.floor(Number(top.nativeCol ?? top.col ?? 0)));
        const sourceImage = { buffer, extension: type.extension, mimeType: type.mimeType, column: startColumn };
        for (let rowNumber = startRow; rowNumber <= Math.min(endRow, startRow + 40); rowNumber += 1) {
          const key = `${worksheet.name}:${rowNumber}`;
          const list = imagesBySheetRow.get(key) || [];
          list.push(sourceImage); imagesBySheetRow.set(key, list);
        }
      }
    }
  } catch {
    // Không chặn việc nhập dữ liệu chữ nếu file dùng định dạng ảnh Excel không hỗ trợ.
  }
  return imagesBySheetRow;
}
function storeSaleExcelImage(image, sheetName, rowNumber) {
  const storedName = `${crypto.randomUUID()}${image.extension}`;
  fs.mkdirSync(saleImagePublicDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(saleImagePublicDir, storedName), image.buffer, { mode: 0o600 });
  return { id: crypto.randomUUID(), url: `/uploads/customs-sale-images/${storedName}`, fileName: `${sheetName}-row-${rowNumber}${image.extension}`, mimeType: image.mimeType };
}
async function parseSaleExcelFile(filePath) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, { entries: 'ignore', sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore', worksheets: 'emit' });
  const sheets = [];
  for await (const worksheet of workbook) {
    const sourceRows = [];
    for await (const row of worksheet) {
      if (row.number <= 2000) sourceRows.push({ number: row.number, values: Array.from({ length: Math.min(60, Math.max(15, row.cellCount || 0)) }, (_, index) => excelCellText(row.getCell(index + 1).value)) });
      if (sourceRows.length >= 2000) break;
    }
    if (sourceRows.some(row => row.values.some(Boolean))) sheets.push({ name: worksheet.name || 'Sheet1', rows: sourceRows });
  }
  const embeddedImages = await saleExcelImagesByRow(filePath);
  const lines = [];
  const patterns = { model: [/^mã hàng/, /mã sản phẩm/, /model/, /型号/], brand: [/nhãn hiệu/, /thương hiệu/, /品牌/], name: [/tên hàng cần khai/, /tên sản phẩm/, /tên hàng/, /mô tả sản phẩm/, /产品说明/], usage: [/công dụng/, /cách sử dụng/, /使用用途/], material: [/chất liệu/, /材料/], weight: [/trọng lượng/, /số kg/, /重量/], size: [/kích thước/, /尺寸/], specs: [/công suất/, /điện áp/, /thông số/], packages: [/số kiện/, /số lượng thùng/, /总件数/], perPackage: [/sản phẩm.*kiện/, /数量.*件/], quantity: [/số lượng khai báo/, /sl khai/, /số lượng.*cái/, /总数量/, /^số lượng/], unit: [/đơn vị.*khai/, /^đvt/, /đơn vị/], price: [/giá sản phẩm/, /giá hđ/, /đơn giá/, /价格/], note: [/ghi chú/, /note/, /笔记/], hs: [/mã hs/, /^hs$/] };
  for (const sheet of sheets) {
    const headerIndex = sheet.rows.findIndex(row => { const text = row.values.join(' ').toLocaleLowerCase('vi-VN'); return patterns.name.some(pattern => pattern.test(text)) && patterns.quantity.some(pattern => pattern.test(text)); });
    if (headerIndex < 0) continue;
    const header = sheet.rows[headerIndex], secondary = sheet.rows[headerIndex + 1] || { values: [] }, columnCount = Math.max(header.values.length, secondary.values.length);
    const secondaryHeaderCount = secondary.values.filter(value => {
      const text = String(value || '').toLocaleLowerCase('vi-VN');
      return Object.values(patterns).some(list => list.some(pattern => pattern.test(text)));
    }).length;
    const hasTwoLevelHeader = secondaryHeaderCount >= 2;
    const headerLabels = Array.from({ length: columnCount }, (_, index) => {
      const parent = String(header.values[index] || '').trim(), child = hasTwoLevelHeader ? String(secondary.values[index] || '').trim() : '';
      // File khách thường có tiêu đề 2 tầng: giữ tên cột chi tiết ở hàng dưới,
      // hoặc ghép cả hai khi cần để không làm mất ngữ nghĩa của cột.
      return child && child !== parent ? (parent && !/thông tin mô tả|thông tin sản phẩm/i.test(parent) ? `${parent} - ${child}` : child) : parent;
    });
    const headers = headerLabels.map(label => label.toLocaleLowerCase('vi-VN'));
    const columns = Object.fromEntries(Object.entries(patterns).map(([key, list]) => [key, headers.findIndex(text => list.some(pattern => pattern.test(text))) + 1]));
    if (!columns.name || !columns.quantity) continue;
    for (const row of sheet.rows.slice(headerIndex + 1)) {
      const read = key => columns[key] ? String(row.values[columns[key] - 1] || '').trim() : '';
      const name = read('name'), quantity = read('quantity');
      if (!name || !quantity || /tổng cộng|total|tên hàng|tên sản phẩm|mô tả sản phẩm/i.test(name) || /số lượng|quantity/i.test(quantity)) continue;
      // Không bỏ các cột đặc thù của khách: chúng được giữ nguyên nhãn và giá trị
      // để Sale hiển thị đúng mẫu Excel thay vì bị ép vào biểu mẫu cố định.
      const sourceColumns = headerLabels.map((label, index) => ({ id: `col-${index + 1}`, label: String(label || '').trim() })).filter(column => column.label).slice(0, 30);
      const extraFields = sourceColumns.map((column, index) => ({ id: crypto.randomUUID(), label: column.label, value: String(row.values[index] || '').trim() })).filter(field => field.value);
      const imageColumnIndexes = headerLabels.map((label, index) => /hình ảnh|hinh anh|image|图片/i.test(label) ? index : -1).filter(index => index >= 0);
      const rowImages = (embeddedImages.get(`${sheet.name}:${row.number}`) || []).filter(image => !imageColumnIndexes.length || imageColumnIndexes.includes(image.column)).slice(0, 10).map(image => storeSaleExcelImage(image, sheet.name, row.number));
      lines.push({ sourceRow: row.number, sheetName: sheet.name, model: read('model'), name, description: name, packageCount: read('packages'), productsPerPackage: read('perPackage'), size: read('size'), qty: quantity, unit: read('unit') || 'Cái', price: read('price'), note: read('note'), sourceColumns, extraFields, images: rowImages });
      if (lines.length >= 300) break;
    }
    if (lines.length >= 300) break;
  }
  if (!lines.length) throw new Error('Không tìm thấy dòng sản phẩm hợp lệ trong file Excel.');
  return { lines, sheetName: sheets.length > 1 ? `${sheets.length} sheet` : sheets[0]?.name || 'Sheet1', imagesImported: lines.reduce((count, line) => count + line.images.length, 0) };
}

function users() {
  const list = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  let changed = false;
  for (const seedFile of [customsStaffSeedFile, dashboardStaffSeedFile]) {
    if (!fs.existsSync(seedFile)) continue;
    try {
      const seeds = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
      for (const seed of Array.isArray(seeds) ? seeds : []) {
        if (!seed?.username || list.some(account => String(account.username).toLowerCase() === String(seed.username).toLowerCase())) continue;
        list.push(seed); changed = true;
      }
    } catch { /* A malformed optional seed must never block login. */ }
  }
  if (changed) saveUsers(list);
  return list;
}
function crmNewSyncConfig() {
  if (!fs.existsSync(crmNewSyncConfigFile)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(crmNewSyncConfigFile, 'utf8'));
    if (!config.url || !config.key) return null;
    return config;
  } catch { return null; }
}
async function syncCrmNewRows(rows) {
  const config = crmNewSyncConfig();
  if (!config) {
    crmNewSyncState = { ...crmNewSyncState, configured: false, ok: false, error: 'Chưa cấu hình Google Sheet sao lưu CRM Mới.' };
    return crmNewSyncState;
  }
  try {
    const response = await fetch(config.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: config.key, action: 'replaceAll', records: rows })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) throw new Error(body.error || 'Google Sheet không phản hồi.');
    crmNewSyncState = { configured: true, ok: true, pending: false, pendingSince: '', updatedAt: body.updatedAt || new Date().toISOString(), error: '', count: Number(body.count || rows.length) };
  } catch (error) {
    crmNewSyncState = { ...crmNewSyncState, configured: true, ok: false, pending: true, error: error.message || 'Không thể sao lưu CRM Mới.' };
  }
  return crmNewSyncState;
}
function queueCrmNewSync() {
  crmNewSyncState = { ...crmNewSyncState, configured: Boolean(crmNewSyncConfig()), pending: true, pendingSince: crmNewSyncState.pendingSince || new Date().toISOString(), error: '' };
  return crmNewSyncState;
}
function runCrmNewSync() {
  if (!crmNewSyncPromise) crmNewSyncPromise = syncCrmNewRows(crmNewRows()).finally(() => { crmNewSyncPromise = null; });
  return crmNewSyncPromise;
}
function millisecondsUntilCrmNewBackup(hour = 23, minute = 55) {
  const now = Date.now(), vietnamNow = new Date(now + 7 * 60 * 60 * 1000);
  let target = Date.UTC(vietnamNow.getUTCFullYear(), vietnamNow.getUTCMonth(), vietnamNow.getUTCDate(), hour, minute) - 7 * 60 * 60 * 1000;
  if (target <= now) target += 24 * 60 * 60 * 1000;
  return target - now;
}
function scheduleCrmNewBackup() {
  setTimeout(async () => {
    if (crmNewSyncState.pending || crmNewRows().length) await runCrmNewSync();
    scheduleCrmNewBackup();
  }, millisecondsUntilCrmNewBackup()).unref();
}
function larkConfig() {
  if (!fs.existsSync(larkConfigFile)) return null;
  const config = JSON.parse(fs.readFileSync(larkConfigFile, 'utf8'));
  if (!config.appId || !config.appSecret || !config.sources?.thuy || !config.sources?.yen) return null;
  return config;
}
function sameSale(left, right) { return String(left || '').trim().toLocaleLowerCase('vi-VN') === String(right || '').trim().toLocaleLowerCase('vi-VN'); }
function saveUsers(list) {
  const temporary = `${usersFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(list, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, usersFile);
}
function crmNewRows() {
  if (!fs.existsSync(crmNewDataFile)) return [];
  try {
    const rows = JSON.parse(fs.readFileSync(crmNewDataFile, 'utf8'));
    if (!Array.isArray(rows)) return [];
    let changed = false;
    for (const row of rows) {
      if (!Array.isArray(row.notes)) row.notes = [];
      for (const note of row.notes) {
        if (!note.id) { note.id = crypto.randomUUID(); changed = true; }
        if (!Array.isArray(note.replies)) { note.replies = []; changed = true; }
      }
    }
    if (changed) saveCrmNewRows(rows);
    return rows;
  } catch { throw new Error('Dữ liệu CRM Mới không hợp lệ.'); }
}
function saveCrmNewRows(rows) {
  const temporary = `${crmNewDataFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, crmNewDataFile);
}
const crmNewStatuses = ['', 'Đã gửi lời mời kết bạn', 'Đã kết bạn', 'Đã gửi tin nhắn khách chưa phản hồi', 'Khách đã tương tác', 'Đã tư vấn dịch vụ'];
const crmNewCategories = ['', 'Khách cực kỳ tiềm năng', 'Khách tiềm năng', 'Khách không tiềm năng'];
const crmNewResults = ['', 'Đã Chốt', 'Chưa Chốt Được'];
const crmNewEditableFields = {
  phone: { label: 'Số điện thoại', limit: 50 }, source: { label: 'Nguồn', limit: 50 }, product: { label: 'Mặt hàng', limit: 200 },
  link: { label: 'Link', limit: 1000 }, status: { label: 'Trạng thái Zalo', values: crmNewStatuses },
  category: { label: 'Phân loại KH', values: crmNewCategories }, result: { label: 'Kết quả', values: crmNewResults }
};
function crmNewActor(user) { return user.name || user.sale || user.username || 'Không xác định'; }
function crmNewAudit(field, from, to, user, at) {
  return { field, label: crmNewEditableFields[field]?.label || field, from: String(from ?? ''), to: String(to ?? ''), author: crmNewActor(user), userId: user.id, at };
}
function crmNewCleanField(field, value) {
  const definition = crmNewEditableFields[field];
  const clean = String(value ?? '').trim();
  if (definition.values && !definition.values.includes(clean)) throw new Error(`${definition.label} không hợp lệ.`);
  return clean.slice(0, definition.limit || 500);
}
function accountingDemoData() {
  if (!fs.existsSync(accountingDemoDataFile)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(accountingDemoDataFile, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch { throw new Error('Dữ liệu nhập liệu demo không hợp lệ.'); }
}
function saveAccountingDemoData(data) {
  const temporary = `${accountingDemoDataFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, accountingDemoDataFile);
}
function customerManagementRows() {
  if (!fs.existsSync(customerManagementDataFile)) return [];
  try { const rows = JSON.parse(fs.readFileSync(customerManagementDataFile, 'utf8')); return Array.isArray(rows) ? rows : []; }
  catch { throw new Error('Dữ liệu Quản lý Khách hàng không hợp lệ.'); }
}
function saveCustomerManagementRows(rows) {
  const temporary = `${customerManagementDataFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, customerManagementDataFile);
}
function canUseCustomerManagement(user) { return user?.role === 'admin'; }
function canUseAccountingDemo(user) { return user && ['admin', 'accountant'].includes(user.role); }
const customsRoles = new Set(['admin', 'accountant', 'sale', 'warehouse_cn', 'customs_declaration', 'manager', 'truck_planner', 'cn_operations']);
function canonicalUserRole(user) {
  const raw = normalized(user?.role);
  const aliases = {
    ADMINISTRATOR: 'admin', QUANTRIVIEN: 'admin',
    ACCOUNTING: 'accountant', KETOAN: 'accountant',
    SALES: 'sale', SALESSTAFF: 'sale', SALESTAFF: 'sale', TRUONGPHONG: 'sale', TEAMLEADER: 'sale', SALESLEADER: 'sale',
    WAREHOUSE: 'warehouse_cn', WAREHOUSECHINA: 'warehouse_cn', KHOTQ: 'warehouse_cn', KHOTRUNGQUOC: 'warehouse_cn',
    CUSTOMS: 'customs_declaration', CUSTOMSHQ: 'customs_declaration', DECLARATION: 'customs_declaration', KHAIBAO: 'customs_declaration', KHAIBAOHQ: 'customs_declaration', NHANVIENKHAIBAO: 'customs_declaration',
    MANAGEMENT: 'manager', QUANLY: 'manager',
    TRUCKPLANNER: 'truck_planner', DIEUVAN: 'truck_planner', XEPXECN: 'truck_planner',
    CNOPERATIONS: 'cn_operations', DIEUVANKHOTQ: 'cn_operations'
  };
  if (aliases[raw]) return aliases[raw];
  if (customsRoles.has(user?.role)) return user.role;
  if (user?.sale || leaderTeam(user)) return 'sale';
  if (normalized(user?.name).startsWith('KBHQ')) return 'customs_declaration';
  return String(user?.role || '').trim();
}
function canUseCustoms(user) { return Boolean(user && customsRoles.has(canonicalUserRole(user))); }
function isCustomsOnlyUser(user) { return Boolean(user && ['customs_declaration', 'cn_operations'].includes(canonicalUserRole(user))); }
function canImportCustomsWarehouse(user) { return Boolean(user && ['admin', 'manager', 'warehouse_cn', 'cn_operations'].includes(user.role)); }
function customsActorRole(user) {
  if (['admin', 'manager'].includes(user?.role)) return 'manager';
  if (user?.role === 'accountant') return 'accounting';
  return user?.role || '';
}
function customsRows() {
  if (!fs.existsSync(customsDataFile)) return [];
  try {
    const rows = JSON.parse(fs.readFileSync(customsDataFile, 'utf8'));
    const list = Array.isArray(rows) ? rows : [];
    // Customs HQ has one source of truth: rows pasted through Nhập kho TQ.
    // Any legacy/demo/Lark rows are removed at the storage layer as well.
    const approved = list.filter(row => row && row.dataEpoch === customsDataEpoch && row.source === 'warehouse_paste');
    if (approved.length !== list.length) {
      if (list.length) {
        const backupDir = path.join(__dirname, 'logs');
        const backupFile = path.join(backupDir, 'customs-backup-before-test-2026-09-14.json');
        fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
        if (!fs.existsSync(backupFile)) fs.writeFileSync(backupFile, `${JSON.stringify(list, null, 2)}\n`, { mode: 0o600 });
      }
      saveCustomsRows(approved);
    }
    return approved;
  }
  catch { throw new Error('Dữ liệu điều phối khai báo không hợp lệ.'); }
}
function saveCustomsRows(rows) {
  const temporary = `${customsDataFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, customsDataFile);
}
function customsSettings() {
  if (!fs.existsSync(customsSettingsFile)) return { exchangeRateUsdVnd: 0, exchangeRateUpdatedAt: '', exchangeRateUpdatedBy: '', history: [] };
  try {
    const value = JSON.parse(fs.readFileSync(customsSettingsFile, 'utf8'));
    return value && typeof value === 'object' ? { exchangeRateUsdVnd: numeric(value.exchangeRateUsdVnd), exchangeRateUpdatedAt: String(value.exchangeRateUpdatedAt || ''), exchangeRateUpdatedBy: String(value.exchangeRateUpdatedBy || ''), history: Array.isArray(value.history) ? value.history : [] } : { exchangeRateUsdVnd: 0, exchangeRateUpdatedAt: '', exchangeRateUpdatedBy: '', history: [] };
  } catch { throw new Error('Cấu hình tỉ giá Khai Báo HQ không hợp lệ.'); }
}
function saveCustomsSettings(settings) {
  const temporary = `${customsSettingsFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, customsSettingsFile);
}
function customsReferences() {
  if (!fs.existsSync(customsReferenceFile)) return [];
  try { const rows = JSON.parse(fs.readFileSync(customsReferenceFile, 'utf8')); return Array.isArray(rows) ? rows : (Array.isArray(rows.records) ? rows.records : []); }
  catch { return []; }
}
function customsVisibleRows(user, rows) {
  // Trưởng phòng vẫn có role "sale" trong hệ thống chung, vì vậy luôn nhận
  // diện phòng trước khi áp dụng phạm vi cá nhân.
  const team = leaderTeam(user);
  if (team) return rows.filter(row => normalized(row.saleTeam) === normalized(team) || normalized(row.saleOwner).startsWith(normalized(team)));
  if (user.role === 'sale') return rows.filter(row => sameSale(row.saleOwner, user.sale) || sameSale(row.saleOwner, user.name));
  return rows;
}
function customsHistory(shipment, user, action, fromStatus, toStatus, content) {
  shipment.history = Array.isArray(shipment.history) ? shipment.history : [];
  shipment.history.push({ id: crypto.randomUUID(), actorId: user.id, actorRole: customsActorRole(user), actor: user.name, action, fromStatus, toStatus, content: String(content || '').slice(0, 4000), createdAt: new Date().toISOString() });
}
function customsChangedFields(before, after, labels) {
  const changed = [];
  for (const key of Object.keys(labels)) {
    if (JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null)) changed.push(labels[key]);
  }
  return changed.length ? changed.join(', ') : 'không thay đổi nội dung';
}
function customsNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '').trim().replace(/\s/g, '');
  if (!text) return 0;
  const normalizedValue = text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text.replace(/,/g, '');
  const output = Number(normalizedValue);
  return Number.isFinite(output) ? output : 0;
}
function customsOperationalDate(value) {
  const original = String(value ?? '').trim();
  const yearFirst = original.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (yearFirst) return `${Number(yearFirst[3])}/${Number(yearFirst[2])}/${yearFirst[1]}`;
  const rendered = operationalLarkDate(value);
  const matched = String(rendered || '').match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!matched) return rendered;
  const first = `${Number(matched[1])}/${Number(matched[2])}/${matched[3]}`;
  const second = Number(matched[1]) <= 12 && Number(matched[2]) <= 12 ? `${Number(matched[2])}/${Number(matched[1])}/${matched[3]}` : '';
  const cutoff = vietnameseDateStamp('18/08/2026');
  return [first, second].find(item => Number.isFinite(vietnameseDateStamp(item)) && vietnameseDateStamp(item) >= cutoff) || first;
}
function customsSourceShipment(table, row) {
  const date = customsOperationalDate(cell(row, column(table.cols, 'NGÀY/ THÁNG', 'NGÀY/THÁNG', 'NGÀY THÁNG', 'NGÀY')));
  if (!Number.isFinite(vietnameseDateStamp(date)) || vietnameseDateStamp(date) < vietnameseDateStamp('18/08/2026')) return null;
  const cargoCode = cell(row, column(table.cols, 'MÃ HÀNG / LÔ', 'MÃ HÀNG/LÔ', 'MÃ HÀNG'));
  if (!cargoCode) return null;
  return {
    operationDate: date,
    cargoCode,
    lotCode: cell(row, column(table.cols, 'LÔ HÀNG', 'LÔ')),
    packageCount: customsNumber(cell(row, column(table.cols, 'SỐ KIỆN'))),
    productName: cell(row, column(table.cols, 'TÊN HÀNG')),
    customerCode: cell(row, column(table.cols, 'MÃ KH', 'MÃ KHÁCH HÀNG')),
    ownerName: cell(row, column(table.cols, 'CHỦ HÀNG', 'TÊN KHÁCH', 'TÊN KH')),
    saleOwner: cell(row, column(table.cols, 'SALE')),
    accountant: cell(row, column(table.cols, 'KẾ TOÁN', 'KETOAN')),
    weightKg: customsNumber(cell(row, column(table.cols, 'KG', 'CÂN (KG)', 'CÂN KG'))),
    volumeM3: customsNumber(cell(row, column(table.cols, 'M3', 'M³', 'KHỐI (M3)', 'KHỐI M3')))
  };
}
async function syncCustomsWarehouseRows() {
  // The Customs HQ module is intentionally independent from Lark/Dashboard.
  // Shipment rows are created only by the direct “Nhập dữ liệu hàng về kho TQ” paste flow.
  return customsRows();
}
function numeric(value) { const normalizedValue = String(value ?? '').replace(/[,\s]/g, ''); const output = Number(normalizedValue); return Number.isFinite(output) ? output : 0; }
function cleanCustomsLine(line, index) {
  const quantity1 = numeric(line?.quantity1), description = String(line?.goodsDescription || '').trim().slice(0, 200);
  const exchangeRate = customsSettings().exchangeRateUsdVnd, importTaxRate = numeric(line?.importTaxRate), vatRate = numeric(line?.vatRate);
  const invoicePriceBeforeTax = numeric(line?.invoicePriceBeforeTax);
  const declaredPriceManual = line?.declaredPriceManual === true;
  const suggestedPriceUsd = exchangeRate > 0 ? Math.round((invoicePriceBeforeTax / exchangeRate * (98 - importTaxRate) / 100) * 1000) / 1000 : 0;
  const declaredPriceUsd = declaredPriceManual ? numeric(line?.declaredPriceUsd) : suggestedPriceUsd;
  const taxableVnd = quantity1 * declaredPriceUsd * exchangeRate;
  const importTaxAmount = taxableVnd * importTaxRate / 100;
  const vatTaxAmount = (importTaxAmount + taxableVnd) * vatRate / 100;
  return { id: String(line?.id || crypto.randomUUID()), lineNumber: index + 1, englishName: String(line?.englishName || '').trim().slice(0, 500), goodsDescription: description, note: String(line?.note || '').trim().slice(0, 1000), invoicePriceBeforeTax: String(line?.invoicePriceBeforeTax || '').trim().slice(0, 100), hsCode: String(line?.hsCode || '').trim().slice(0, 30), quantity1, unit1: String(line?.unit1 || 'Cái').trim().slice(0, 30), quantity2: numeric(line?.quantity2), unit2: String(line?.unit2 || '').trim().slice(0, 30), declaredPriceUsd, declaredPriceManual, packageCount: numeric(line?.packageCount), netWeightKg: numeric(line?.netWeightKg), grossWeightKg: numeric(line?.grossWeightKg), totalUsd: quantity1 * declaredPriceUsd, exchangeRateUsdVnd: exchangeRate, importTaxRate, importTaxAmount, vatRate, vatTaxAmount, totalTaxVnd: importTaxAmount + vatTaxAmount, characterCount: description.length };
}
function crmNewToday() {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts().filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function crmNewVisibleRows(user, rows) {
  if (user.role !== 'sale') return rows;
  const team = leaderTeam(user);
  return rows.filter(row => sameSale(row.sale, user.sale) || (team && String(row.sale || '').trim().toLocaleUpperCase('vi-VN').startsWith(team)));
}
function hash(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }
function verifyPassword(password, stored) {
  const [algorithm, salt, expected] = String(stored || '').split('$');
  if (algorithm === 'sha256') {
    const actual = crypto.createHash('sha256').update(password).digest('hex');
    return expected && crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  }
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
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
    const account = session.exp > Date.now() ? users().find(user => user.id === session.id && user.active !== false) || null : null;
    return account ? { ...account, role: canonicalUserRole(account) } : null;
  } catch { return null; }
}
function profile(user) { return { id: user.id, name: user.name, role: user.role, sale: user.sale || null, team: leaderTeam(user) }; }
function readJson(req) { return new Promise((resolve, reject) => { let body = ''; req.on('data', chunk => { body += chunk; if (body.length > 3000000) req.destroy(); }); req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Dữ liệu không hợp lệ')); } }); req.on('error', reject); }); }
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
async function larkRows(source, token, renderOption = 'UnformattedValue') {
  const range = `${source.sheetId}!A1:AS${source.maxRows || 10000}`;
  const url = `https://open.larksuite.com/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(source.spreadsheetToken)}/values/${encodeURIComponent(range)}?valueRenderOption=${encodeURIComponent(renderOption)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json();
  if (!response.ok || body.code) throw new Error(body.msg || `Không thể đọc sheet Lark ${source.label || ''}.`);
  const values = body.data?.valueRange?.values || [];
  const dateColumns = new Set((values[0] || []).map((header, index) => normalized(header).includes('NGAY') ? index : -1).filter(index => index >= 0));
  return values.map((row, rowIndex) => row.map((value, index) => {
    if (value == null) return '';
    return renderOption === 'UnformattedValue' && rowIndex && dateColumns.has(index) ? operationalLarkDate(value) : value;
  }));
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
function leaderTeam(user) {
  const sale = normalized(user?.sale || user?.name);
  return sale === 'TP5THAM' ? 'P5' : sale === 'TP8TUAN' ? 'P8' : null;
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
function warehouseMetricColumn(table, ...names) {
  const wanted = names.map(normalized);
  const direct = table.cols.findIndex(value => wanted.includes(normalized(value)));
  if (direct >= 0) return direct;
  for (const headerRow of table.rows.slice(0, 3)) {
    const index = headerRow.findIndex(value => wanted.includes(normalized(value)));
    if (index >= 0) return index;
  }
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
function operationalLarkDate(value) {
  const rendered = larkDate(value);
  const matched = rendered.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!matched) return rendered;
  const day = Number(matched[1]), month = Number(matched[2]), year = Number(matched[3]);
  if (day > 12 || month > 12) return rendered;
  const current = new Date();
  const cutoff = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate() + 1);
  const normal = Date.UTC(year, month - 1, day);
  const swapped = Date.UTC(year, day - 1, month);
  if (normal > cutoff && swapped <= cutoff) return `${month}/${day}/${year}`;
  return rendered;
}
function vietnameseDateStamp(value) {
  const matched = String(value || '').trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!matched) return NaN;
  const day = Number(matched[1]), month = Number(matched[2]), year = Number(matched[3]);
  const stamp = Date.UTC(year, month - 1, day), date = new Date(stamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? stamp : NaN;
}
function larkDateInRange(value, earliest, latest) {
  const rendered = larkDate(value), matched = rendered.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!matched) return rendered;
  const candidates = [rendered];
  if (Number(matched[1]) <= 12 && Number(matched[2]) <= 12) candidates.push(`${Number(matched[2])}/${Number(matched[1])}/${matched[3]}`);
  const minimum = vietnameseDateStamp(earliest), maximum = vietnameseDateStamp(latest);
  return candidates.find(candidate => {
    const stamp = vietnameseDateStamp(candidate);
    return Number.isFinite(stamp) && (!Number.isFinite(minimum) || stamp >= minimum) && (!Number.isFinite(maximum) || stamp <= maximum);
  }) || rendered;
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
  const matches = [];
  for (const [warehouseIndex, table] of data.warehouses.entries()) {
    const codeColumn = column(table.cols, 'MÃ HÀNG');
    for (const row of table.rows.filter(item => normalized(cell(item, codeColumn)) === normalized(code))) {
      const vehicle = cell(row, column(table.cols, 'BIỂN SỐ XE/ CỬA KHẨU', 'BIỂN SỐ XE'));
      const loaded = cell(row, column(table.cols, 'NGÀY BỐC'));
      const score = (dateFromVehicle(vehicle) ? 100 : 0) + (loaded ? 10 : 0) + (vehicle ? 1 : 0) + warehouseIndex;
      matches.push({ table, row, monthFirstDates: warehouseIndex >= 2, score });
    }
  }
  const found = matches.sort((a, b) => b.score - a.score)[0] || null;
  if (!found) return { found: false, code };
  const { table, row, monthFirstDates } = found;
  const officialCode = cell(row, column(table.cols, 'MÃ HÀNG'));
  const entered = larkDate(row[column(table.cols, 'NGÀY/ THÁNG', 'NGÀY THÁNG', 'NGÀY VỀ KHO TQ', 'NGÀY NHẬP KHO', 'NGÀY')], monthFirstDates);
  const weightKg = cell(row, warehouseMetricColumn(table, 'KG', 'CÂN (KG)', 'CÂN KG'));
  const volumeM3 = cell(row, warehouseMetricColumn(table, 'M3', 'KHỐI (M3)', 'KHỐI M3'));
  const vehicle = cell(row, column(table.cols, 'BIỂN SỐ XE/ CỬA KHẨU', 'BIỂN SỐ XE'));
  const loaded = larkDate(row[column(table.cols, 'NGÀY BỐC')], monthFirstDates) || dateFromVehicle(vehicle);
  const vehicleMatches = [];
  for (const [vehicleTableIndex, candidate] of data.vehicles.entries()) {
    const vehicleColumn = column(candidate.cols, 'BIỂN SỐ XE');
    for (const match of candidate.rows.filter(item => normalized(cell(item, vehicleColumn)) === normalized(vehicle))) {
      const status = cell(match, column(candidate.cols, 'TRẠNG THÁI'));
      const customsDate = cell(match, column(candidate.cols, 'NGÀY THÔNG QUAN'));
      const hanoiDate = cell(match, column(candidate.cols, 'NGÀY HẠ KHO HN'));
      const score = (hanoiDate ? 1000 : 0) + (normalized(status) === normalized('ĐÃ THÔNG QUAN') ? 500 : 0) + (customsDate ? 200 : 0) + vehicleTableIndex;
      vehicleMatches.push({ row: match, table: candidate, score });
    }
  }
  const vehicleMatch = vehicleMatches.sort((a, b) => b.score - a.score)[0] || null;
  const vehicleRow = vehicleMatch?.row || null, vehicleTable = vehicleMatch?.table || null;
  const vehicleStatus = vehicleRow ? cell(vehicleRow, column(vehicleTable.cols, 'TRẠNG THÁI')) : '';
  const hanoi = vehicleRow ? larkDate(vehicleRow[column(vehicleTable.cols, 'NGÀY HẠ KHO HN')]) : '';
  const customs = normalized(vehicleStatus) === normalized('ĐÃ THÔNG QUAN') ? larkDateInRange(vehicleRow[column(vehicleTable.cols, 'NGÀY THÔNG QUAN')], loaded, hanoi) : '';
  const deliveryCode = column(data.deliveries.cols, 'MÃ HÀNG'), deliveryDate = column(data.deliveries.cols, 'NGÀY'), deliveryPackages = column(data.deliveries.cols, 'SỐ KIỆN THỰC GIAO');
  const deliveries = data.deliveries.rows.filter(item => normalized(cell(item, deliveryCode)) === normalized(officialCode)).map(item => ({ date: larkDate(item[deliveryDate]), packages: cell(item, deliveryPackages) }));
  return { source: 'lark-v3', found: true, code: officialCode, entered, weightKg, volumeM3, vehicle, loaded, vehicleStatus, customs, hanoi, deliveries };
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
function canonicalCkWarehouseRows(rows) {
  const headers = Array(45).fill('');
  Object.assign(headers, { 0: 'NGÀY/ THÁNG', 3: 'MÃ HÀNG', 4: 'SỐ KIỆN', 5: 'TÊN HÀNG', 6: 'MÃ KH', 7: 'CHỦ HÀNG', 8: 'SALE', 9: 'Phòng Sale', 10: 'Kế toán', 11: 'KG', 12: 'M3', 34: 'TỔNG KH THANH TOÁN', 35: 'TRẠNG THÁI', 37: 'DOANH SỐ THỰC', 39: 'NGÀY BỐC', 40: 'BIỂN SỐ XE/ CỬA KHẨU', 41: 'SỐ KIỆN BỐC', 42: 'TỒN KHO', 44: 'PHÍ VẬN CHUYỂN/M3' });
  return [headers, ...rows.slice(2).filter(row => row[1]).map(row => {
    const value = Array(45).fill('');
    value[0] = operationalLarkDate(row[0]); value[3] = row[1]; value[4] = row[2]; value[5] = row[3];
    value[6] = row[11]; value[7] = row[12]; value[8] = row[13]; value[9] = row[14]; value[10] = row[15];
    value[11] = row[4]; value[12] = row[5]; value[34] = row[19]; value[35] = row[18]; value[37] = row[20];
    value[39] = operationalLarkDate(row[21]); value[40] = row[22]; value[41] = row[23]; value[42] = row[24]; value[44] = row[26];
    return value;
  })];
}
async function warehouseData(report = 'cn') {
  const config = larkConfig();
  if (!config) throw new Error('Chưa có cấu hình nguồn Lark.');
  const sources = report === 'ck' ? [config.sources.thuyCk, config.sources.yenCk] : [config.sources.thuy, config.sources.yen];
  if (sources.some(source => !source)) throw new Error('Chưa có cấu hình dữ liệu hàng CK trên Lark.');
  const token = await larkToken(config);
  const rows = await Promise.all(sources.map(source => larkRows(source, token)));
  return report === 'ck' ? rows.map(canonicalCkWarehouseRows) : rows;
}
async function debtData(report = 'cn') {
  const config = larkConfig();
  const debtKeys = report === 'ck' ? ['thuyCkDebt', 'yenCkDebt'] : ['thuyDebt', 'yenDebt'];
  const warehouseSources = report === 'ck' ? [config.sources.thuyCk, config.sources.yenCk] : [config.sources.thuy, config.sources.yen];
  if (!config?.sources?.[debtKeys[0]] || !config.sources[debtKeys[1]] || warehouseSources.some(source => !source)) throw new Error(`Chưa có cấu hình công nợ ${report.toUpperCase()} trên Lark.`);
  const token = await larkToken(config);
  const [thuySource, yenSource] = await Promise.all([
    resolveLarkSource(config.sources[debtKeys[0]], token),
    resolveLarkSource(config.sources[debtKeys[1]], token)
  ]);
  const roomByCustomer = rows => new Map(rows.slice(1).reduce((items, row) => {
    const customer = normalized(row[7]);
    const room = String(row[9] || '').trim();
    if (customer && room) items.push([customer, room]);
    return items;
  }, []));
  const asDashboardDebtRows = (rows, formulaRows, inferredRooms) => {
    const headerIndex = rows.findIndex(row => row.some(value => ['CHỦ HÀNG', 'TÊN KHÁCH'].some(name => normalized(value) === normalized(name))));
    if (headerIndex < 0) throw new Error('Không tìm thấy cột khách hàng trong dữ liệu công nợ Lark.');
    const table = { cols: rows[headerIndex].map(value => String(value ?? '').trim()), rows: rows.slice(headerIndex + 1) };
    const room = column(table.cols, 'PHÒNG', 'PHONG');
    const customer = column(table.cols, 'CHỦ HÀNG', 'TÊN KHÁCH');
    const opening = column(table.cols, 'TỒN ĐẦU NĂM');
    // CN uses "CÔNG NỢ 2026" while CK uses "CÔNG NỢ PHÁT SINH".
    // Keep the exact CK header first so a generic debt/balance column is never selected instead.
    const debt = column(table.cols, 'CÔNG NỢ PHÁT SINH', 'CÔNG NỢ 2026', 'CÔNG NỢ 2025');
    const paid = column(table.cols, 'ĐÃ THANH TOÁN');
    const balance = column(table.cols, 'CÔNG NỢ TỒN', 'CÔNG NỢ', 'CÒN NỢ TỒN');
    const summaryFormula = String((formulaRows[headerIndex + 1] || [])[balance] || '');
    const endRow = Number((summaryFormula.match(/:[A-Z]+(\d+)\)/i) || [])[1]) || Infinity;
    return table.rows
      .filter((_, index) => headerIndex + index + 2 <= endRow)
      .filter(row => cell(row, customer))
      .map(row => {
        const customerName = cell(row, customer);
        return [cell(row, room) || (room < 0 ? cell(row, 0) : '') || inferredRooms.get(normalized(customerName)) || '', customerName, row[opening] ?? 0, row[debt] ?? 0, row[paid] ?? 0, row[balance] ?? 0];
      });
  };
  const [thuyRows, yenRows, thuyFormulaRows, yenFormulaRows, thuyWarehouse, yenWarehouse] = await Promise.all([
    larkRows(thuySource, token), larkRows(yenSource, token), larkRows(thuySource, token, 'Formula'), larkRows(yenSource, token, 'Formula'), larkRows(warehouseSources[0], token), larkRows(warehouseSources[1], token)
  ]);
  const canonicalWarehouses = report === 'ck' ? [canonicalCkWarehouseRows(thuyWarehouse), canonicalCkWarehouseRows(yenWarehouse)] : [thuyWarehouse, yenWarehouse];
  return [asDashboardDebtRows(thuyRows, thuyFormulaRows, roomByCustomer(canonicalWarehouses[0])), asDashboardDebtRows(yenRows, yenFormulaRows, roomByCustomer(canonicalWarehouses[1]))];
}
async function dashboardData(user, report = 'cn', scope = 'personal') {
  const [[debtThuy, debtYen], [warehouseThuy, warehouseYen]] = await Promise.all([
    debtData(report),
    warehouseData(report)
  ]);
  if (user.role === 'sale') {
    const scopedData = (debts, warehouse, filter) => {
      const selectedWarehouse = filter(warehouse);
      const customers = new Set(selectedWarehouse.map(row => normalized(row[7])).filter(Boolean));
      return { debt: debts.filter(row => customers.has(normalized(row[1]))), warehouse: selectedWarehouse };
    };
    const team = leaderTeam(user);
    if (scope === 'team' && team) {
      const filterTeam = rows => rows.filter(row => String(row[8] || '').trim().toLocaleUpperCase('vi-VN').startsWith(team));
      return { thuy: scopedData(debtThuy, warehouseThuy, filterTeam), yen: scopedData(debtYen, warehouseYen, filterTeam) };
    }
    const allowedSales = [user.sale, ...(user.saleAliases || [])]
      .map(value => String(value || '').trim().toLocaleLowerCase('vi-VN'))
      .filter(Boolean);
    const filterSale = rows => rows.filter(row => allowedSales.includes(String(row[8] || '').trim().toLocaleLowerCase('vi-VN')));
    return { thuy: scopedData(debtThuy, warehouseThuy, filterSale), yen: scopedData(debtYen, warehouseYen, filterSale) };
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
  if (pathname === '/api/customs-sale-images/start' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
    try {
      for (const [staleId, stale] of saleImageUploads) if (Date.now() - stale.createdAt > 2 * 60 * 60 * 1000) { saleImageUploads.delete(staleId); try { fs.unlinkSync(stale.filePath); } catch {} }
      const { fileName, fileSize, shipmentId, mimeType } = await readJson(req), size = Number(fileSize || 0), shipment = customsRows().find(row => row.id === shipmentId);
      if (!shipment) return send(res, 404, { error: 'Không tìm thấy mã hàng cần tải ảnh.' });
      const team = leaderTeam(user), managesShipment = Boolean(team && (normalized(shipment.saleTeam) === normalized(team) || normalized(shipment.saleOwner).startsWith(normalized(team)))), owns = sameSale(shipment.saleOwner, user.sale) || sameSale(shipment.saleOwner, user.name);
      if (!(user.role === 'admin' || managesShipment || (user.role === 'sale' && owns)) || shipment.status !== 'sale_required') return send(res, 403, { error: 'Chỉ Sale phụ trách được tải ảnh khi hồ sơ đang chờ Sale bổ sung.' });
      const allowed = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }, extension = allowed[String(mimeType || '').toLowerCase()];
      if (!extension) return send(res, 400, { error: 'Chỉ nhận ảnh JPG, PNG hoặc WebP.' });
      if (!(size > 0) || size > saleImageMaxBytes) return send(res, 400, { error: 'Mỗi ảnh phải nhỏ hơn hoặc bằng 8 MB.' });
      fs.mkdirSync(saleImageUploadDir, { recursive: true, mode: 0o700 });
      const uploadId = crypto.randomUUID(), filePath = path.join(saleImageUploadDir, `${uploadId}${extension}`);
      fs.writeFileSync(filePath, Buffer.alloc(0), { mode: 0o600 });
      saleImageUploads.set(uploadId, { userId: user.id, shipmentId, filePath, fileName: path.basename(String(fileName || 'anh-hang').replace(/[\\/]/g, '-')).slice(0, 255), mimeType: String(mimeType).toLowerCase(), extension, expectedSize: size, received: 0, nextIndex: 0, createdAt: Date.now() });
      return send(res, 200, { uploadId, chunkSize: saleImageChunkBytes });
    } catch (error) { return send(res, 400, { error: error.message || 'Không thể bắt đầu tải ảnh.' }); }
  }
  if (pathname === '/api/customs-sale-images/chunk' && req.method === 'PUT') {
    if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
    const query = new URL(req.url, 'https://dashboard.local').searchParams, upload = saleImageUploads.get(String(query.get('id') || '')), index = Number(query.get('index'));
    if (!upload || upload.userId !== user.id) return send(res, 404, { error: 'Phiên tải ảnh không còn hiệu lực.' });
    if (index !== upload.nextIndex) return send(res, 409, { error: 'Thứ tự phần tải ảnh không hợp lệ.' });
    try {
      const chunk = await readRaw(req, saleImageChunkBytes); if (!chunk.length || upload.received + chunk.length > upload.expectedSize) throw new Error('Dung lượng ảnh tải lên không hợp lệ.');
      fs.appendFileSync(upload.filePath, chunk); upload.received += chunk.length; upload.nextIndex += 1;
      return send(res, 200, { ok: true, received: upload.received });
    } catch (error) { return send(res, 400, { error: error.message || 'Không thể nhận phần ảnh.' }); }
  }
  if (pathname === '/api/customs-sale-images/finish' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
    let upload, uploadId = '';
    try {
      const body = await readJson(req); uploadId = String(body.uploadId || ''); upload = saleImageUploads.get(uploadId);
      if (!upload || upload.userId !== user.id) return send(res, 404, { error: 'Phiên tải ảnh không còn hiệu lực.' });
      if (upload.received !== upload.expectedSize) return send(res, 400, { error: 'Ảnh chưa được tải lên đầy đủ.' });
      fs.mkdirSync(saleImagePublicDir, { recursive: true, mode: 0o700 });
      const storedName = `${crypto.randomUUID()}${upload.extension}`, storedPath = path.join(saleImagePublicDir, storedName);
      fs.renameSync(upload.filePath, storedPath); upload.filePath = '';
      return send(res, 200, { image: { id: crypto.randomUUID(), url: `/uploads/customs-sale-images/${storedName}`, fileName: upload.fileName, mimeType: upload.mimeType } });
    } catch (error) { return send(res, 400, { error: error.message || 'Không thể hoàn tất tải ảnh.' }); }
    finally { if (upload) { saleImageUploads.delete(uploadId); if (upload.filePath) try { fs.unlinkSync(upload.filePath); } catch {} } }
  }
  if (pathname === '/api/customs-sale-excel/start' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
    try {
      for (const [staleId, stale] of saleExcelUploads) if (Date.now() - stale.createdAt > 2 * 60 * 60 * 1000) { saleExcelUploads.delete(staleId); try { fs.unlinkSync(stale.filePath); } catch {} }
      const { fileName, fileSize, shipmentId } = await readJson(req), size = Number(fileSize || 0), shipment = customsRows().find(row => row.id === shipmentId);
      if (!shipment) return send(res, 404, { error: 'Không tìm thấy mã hàng cần nhập Excel.' });
      const team = leaderTeam(user), managesShipment = Boolean(team && (normalized(shipment.saleTeam) === normalized(team) || normalized(shipment.saleOwner).startsWith(normalized(team)))), owns = sameSale(shipment.saleOwner, user.sale) || sameSale(shipment.saleOwner, user.name);
      if (!(user.role === 'admin' || managesShipment || (user.role === 'sale' && owns)) || shipment.status !== 'sale_required') return send(res, 403, { error: 'Chỉ Sale phụ trách được nhập Excel khi hồ sơ đang chờ Sale bổ sung.' });
      if (!/\.xlsx$/i.test(String(fileName || ''))) return send(res, 400, { error: 'Chỉ hỗ trợ file Excel định dạng .xlsx.' });
      if (!(size > 0) || size > saleExcelMaxBytes) return send(res, 400, { error: 'File Excel phải nhỏ hơn 500 MB.' });
      fs.mkdirSync(saleExcelUploadDir, { recursive: true, mode: 0o700 });
      const uploadId = crypto.randomUUID(), filePath = path.join(saleExcelUploadDir, `${uploadId}.xlsx`);
      fs.writeFileSync(filePath, Buffer.alloc(0), { mode: 0o600 }); saleExcelUploads.set(uploadId, { userId: user.id, shipmentId, filePath, fileName: path.basename(String(fileName)), expectedSize: size, received: 0, nextIndex: 0, createdAt: Date.now() });
      return send(res, 200, { uploadId, chunkSize: 768 * 1024 });
    } catch (error) { return send(res, 400, { error: error.message || 'Không thể bắt đầu tải file Excel.' }); }
  }
  if (pathname === '/api/customs-sale-excel/chunk' && req.method === 'PUT') {
    if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
    const query = new URL(req.url, 'https://dashboard.local').searchParams, upload = saleExcelUploads.get(String(query.get('id') || '')), index = Number(query.get('index'));
    if (!upload || upload.userId !== user.id) return send(res, 404, { error: 'Phiên tải Excel không còn hiệu lực.' });
    if (index !== upload.nextIndex) return send(res, 409, { error: 'Thứ tự phần tải Excel không hợp lệ.' });
    try {
      const chunk = await readRaw(req, saleExcelChunkBytes); if (!chunk.length || upload.received + chunk.length > upload.expectedSize) throw new Error('Dung lượng file tải lên không hợp lệ.');
      fs.appendFileSync(upload.filePath, chunk); upload.received += chunk.length; upload.nextIndex += 1;
      return send(res, 200, { ok: true, received: upload.received });
    } catch (error) { return send(res, 400, { error: error.message || 'Không thể nhận phần dữ liệu Excel.' }); }
  }
  if (pathname === '/api/customs-sale-excel/finish' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
    let upload, uploadId = '';
    try {
      const body = await readJson(req); uploadId = String(body.uploadId || ''); upload = saleExcelUploads.get(uploadId);
      if (!upload || upload.userId !== user.id) return send(res, 404, { error: 'Phiên tải Excel không còn hiệu lực.' });
      if (upload.received !== upload.expectedSize) return send(res, 400, { error: 'File Excel chưa được tải lên đầy đủ.' });
      const result = await parseSaleExcelFile(upload.filePath);
      return send(res, 200, { ...result, fileName: upload.fileName });
    } catch (error) { return send(res, 400, { error: error.message || 'Không thể đọc file Excel.' }); }
    finally { if (upload) { saleExcelUploads.delete(uploadId); try { fs.unlinkSync(upload.filePath); } catch {} } }
  }
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
  if (pathname === '/api/crm-new/lark-report' || pathname === '/api/crm-new/lark-report/preview') {
    if (!user || user.role !== 'admin') return send(res, user ? 403 : 401, { error: 'Chỉ Admin được cấu hình và gửi báo cáo Lark.' });
    try {
      if (req.method === 'GET') {
        const date = new URL(req.url, 'https://dashboard.local').searchParams.get('date');
        return send(res, 200, pathname.endsWith('/preview') ? crmLarkReporter.preview(date) : crmLarkReporter.status());
      }
      if (req.method !== 'POST' || pathname.endsWith('/preview')) return send(res, 405, { error: 'Phương thức không hỗ trợ.' });
      const input = await readJson(req);
      if (input.action === 'configure') return send(res, 200, crmLarkReporter.configure(input));
      if (input.action === 'test') {
        const result = await crmLarkReporter.testConnection();
        return send(res, result.ok ? 200 : 502, result);
      }
      if (input.action === 'send') {
        const result = crmLarkReporter.queue(input.date, input.retry === true);
        return send(res, 202, result);
      }
      return send(res, 400, { error: 'Thao tác báo cáo Lark không hợp lệ.' });
    } catch (error) { return send(res, 400, { error: error.message || 'Không thể xử lý báo cáo Lark.' }); }
  }
  if (pathname === '/api/crm-new/leads' && req.method === 'GET') {
    if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
    try {
      const rows = crmNewVisibleRows(user, crmNewRows()).sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
      return send(res, 200, { rows, user: profile(user) });
    } catch (error) { return send(res, 500, { error: error.message || 'Không thể tải CRM Mới.' }); }
  }
  if (pathname === '/api/crm-new/sync-status' && req.method === 'GET') {
    if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
    return send(res, 200, { ...crmNewSyncState, configured: Boolean(crmNewSyncConfig()) });
  }
  if (pathname === '/api/crm-new/sync' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
    if (user.role !== 'admin') return send(res, 403, { error: 'Chỉ Quản trị viên có thể đồng bộ toàn bộ CRM Mới.' });
    try { return send(res, 200, await runCrmNewSync()); }
    catch (error) { return send(res, 500, { error: error.message || 'Không thể đồng bộ CRM Mới.' }); }
  }
  if (pathname === '/api/crm-new/leads' && req.method === 'POST') {
    if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' });
    try {
      const { action, record, id, text } = await readJson(req);
      const rows = crmNewRows();
      if (action === 'create') {
        if (user.role !== 'sale') return send(res, 403, { error: 'Chỉ tài khoản Sale có thể tạo khách hàng.' });
        const name = String(record?.name || '').trim();
        if (!name || name.length > 150) return send(res, 400, { error: 'Vui lòng nhập tên khách hàng.' });
        const requestId = String(record?.requestId || '').trim().slice(0, 100);
        const repeated = requestId && rows.find(row => row.createRequestId === requestId && sameSale(row.sale, user.sale));
        if (repeated) return send(res, 200, { record: repeated, duplicatePrevented: true, sync: queueCrmNewSync() });
        const now = new Date().toISOString();
        const item = {
          id: crypto.randomUUID(), name, phone: crmNewCleanField('phone', record?.phone), source: crmNewCleanField('source', record?.source || 'Khác'),
          link: crmNewCleanField('link', record?.link), product: crmNewCleanField('product', record?.product), status: '', category: '', result: '',
          sale: user.sale || user.name, createRequestId: requestId || crypto.randomUUID(), foundAt: crmNewToday(), createdAt: now, updatedAt: now, notes: [],
          history: [{ field: 'created', label: 'Tạo hồ sơ', from: '', to: name, author: crmNewActor(user), userId: user.id, at: now }],
          zaloTimeline: [{ status: '', label: 'Chưa cập nhật', author: crmNewActor(user), userId: user.id, at: now }]
        };
        const initialNote = String(record?.note || '').trim().slice(0, 4000);
        if (initialNote) {
          item.notes.push({ id: crypto.randomUUID(), text: initialNote, author: crmNewActor(user), userId: user.id, at: now, replies: [] });
          item.history.push({ field: 'note', label: 'Ghi chú', from: '', to: initialNote, author: crmNewActor(user), userId: user.id, at: now });
        }
        rows.push(item); saveCrmNewRows(rows);
        return send(res, 201, { record: item, sync: queueCrmNewSync() });
      }
      const item = rows.find(row => row.id === id || row.id === record?.id);
      if (action === 'replyNote') {
        if (user.role !== 'admin') return send(res, 403, { error: 'Chỉ Admin có thể phản hồi ghi chú của Sale.' });
        if (!item) return send(res, 404, { error: 'Không tìm thấy khách hàng.' });
        const note = item.notes.find(entry => entry.id === record?.noteId), replyText = String(record?.text || '').trim().slice(0, 4000);
        if (!note) return send(res, 404, { error: 'Không tìm thấy ghi chú.' });
        if (!replyText) return send(res, 400, { error: 'Vui lòng nhập nội dung phản hồi.' });
        const now = new Date().toISOString();
        note.replies.push({ id: crypto.randomUUID(), text: replyText, author: crmNewActor(user), userId: user.id, at: now, readAt: '' });
        item.history = Array.isArray(item.history) ? item.history : [];
        item.history.push({ field: 'adminReply', label: 'Phản hồi Admin', from: note.text, to: replyText, author: crmNewActor(user), userId: user.id, at: now });
        item.updatedAt = now; saveCrmNewRows(rows);
        return send(res, 200, { record: item, sync: queueCrmNewSync() });
      }
      if (action === 'markRepliesRead') {
        if (user.role !== 'sale' || !item || !sameSale(item.sale, user.sale)) return send(res, 403, { error: 'Bạn chỉ có thể đọc thông báo của khách hàng mình phụ trách.' });
        const now = new Date().toISOString(); let changed = false;
        for (const note of item.notes) for (const reply of note.replies) if (!reply.readAt) { reply.readAt = now; changed = true; }
        if (changed) { item.updatedAt = now; saveCrmNewRows(rows); queueCrmNewSync(); }
        return send(res, 200, { record: item, unread: 0 });
      }
      if (!item || !sameSale(item.sale, user.sale)) return send(res, 403, { error: 'Bạn chỉ có thể cập nhật khách hàng của mình.' });
      if (action === 'update') {
        const now = new Date().toISOString(), changes = [];
        item.history = Array.isArray(item.history) ? item.history : [];
        for (const field of Object.keys(crmNewEditableFields)) {
          if (!Object.prototype.hasOwnProperty.call(record || {}, field)) continue;
          const next = crmNewCleanField(field, record[field]), previous = String(item[field] ?? '');
          if (next === previous) continue;
          changes.push(crmNewAudit(field, previous, next, user, now)); item[field] = next;
          if (field === 'status') {
            item.zaloTimeline = Array.isArray(item.zaloTimeline) && item.zaloTimeline.length ? item.zaloTimeline : [{ status: '', label: 'Chưa cập nhật', author: 'Hệ thống', at: item.createdAt || now }];
            item.zaloTimeline.push({ status: next, label: next || 'Chưa cập nhật', author: crmNewActor(user), userId: user.id, at: now });
          }
        }
        const note = String(record?.note || '').trim().slice(0, 4000);
        if (note) {
          item.notes = Array.isArray(item.notes) ? item.notes : [];
          item.notes.push({ id: crypto.randomUUID(), text: note, author: crmNewActor(user), userId: user.id, at: now, replies: [] });
          changes.push({ field: 'note', label: 'Ghi chú', from: '', to: note, author: crmNewActor(user), userId: user.id, at: now });
        }
        if (!changes.length) return send(res, 200, { record: item, unchanged: true, sync: crmNewSyncState });
        item.history.push(...changes); item.updatedAt = now; saveCrmNewRows(rows);
        return send(res, 200, { record: item, sync: queueCrmNewSync() });
      }
      if (action === 'addNote') {
        const note = String(text || '').trim().slice(0, 4000);
        if (!note) return send(res, 400, { error: 'Vui lòng nhập nội dung ghi chú.' });
        item.notes = Array.isArray(item.notes) ? item.notes : [];
        const now = new Date().toISOString();
        item.notes.push({ id: crypto.randomUUID(), text: note, author: crmNewActor(user), userId: user.id, at: now, replies: [] });
        item.history = Array.isArray(item.history) ? item.history : [];
        item.history.push({ field: 'note', label: 'Ghi chú', from: '', to: note, author: crmNewActor(user), userId: user.id, at: now });
        item.updatedAt = now; saveCrmNewRows(rows);
        return send(res, 200, { record: item, sync: queueCrmNewSync() });
      }
      return send(res, 400, { error: 'Thao tác CRM Mới không hợp lệ.' });
    } catch (error) { return send(res, 500, { error: error.message || 'Không thể lưu CRM Mới.' }); }
  }
  if (pathname === '/api/accounting-entry-demo' && req.method === 'GET') {
    if (!canUseAccountingDemo(user)) return send(res, user ? 403 : 401, { error: 'Chỉ Admin hoặc Kế toán được sử dụng khu vực nhập liệu.' });
    try { return send(res, 200, { data: accountingDemoData(), user: profile(user) }); }
    catch (error) { return send(res, 500, { error: error.message || 'Không thể tải dữ liệu nhập liệu demo.' }); }
  }
  if (pathname === '/api/accounting-entry-demo' && req.method === 'POST') {
    if (!canUseAccountingDemo(user)) return send(res, user ? 403 : 401, { error: 'Chỉ Admin hoặc Kế toán được sử dụng khu vực nhập liệu.' });
    try {
      const { report, accountant, rows } = await readJson(req);
      if (!['cn', 'ck'].includes(report) || !['thuy', 'yen'].includes(accountant) || !Array.isArray(rows) || rows.length > 1000) return send(res, 400, { error: 'Dữ liệu nhập liệu demo không hợp lệ.' });
      const cleanRows = rows.map(row => Array.isArray(row) ? row.slice(0, 50).map(value => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 500)) : []).filter(row => row.some(value => value.trim()));
      const data = accountingDemoData(), key = `${report}:${accountant}`;
      data[key] = { rows: cleanRows, updatedAt: new Date().toISOString(), updatedBy: user.name || user.username };
      saveAccountingDemoData(data);
      return send(res, 200, { ok: true, record: data[key] });
    } catch (error) { return send(res, 500, { error: error.message || 'Không thể lưu dữ liệu nhập liệu demo.' }); }
  }
  if (pathname === '/api/customer-management' && req.method === 'GET') {
    if (!canUseCustomerManagement(user)) return send(res, user ? 403 : 401, { error: 'Giai đoạn này chỉ Admin được sử dụng Quản lý Khách hàng.' });
    try { return send(res, 200, { rows: customerManagementRows(), user: profile(user) }); }
    catch (error) { return send(res, 500, { error: error.message || 'Không thể tải dữ liệu khách hàng.' }); }
  }
  if (pathname === '/api/customer-management' && req.method === 'POST') {
    if (!canUseCustomerManagement(user)) return send(res, user ? 403 : 401, { error: 'Giai đoạn này chỉ Admin được cập nhật Quản lý Khách hàng.' });
    try {
      const { action, id, record } = await readJson(req), rows = customerManagementRows();
      const channels = ['Wechat', 'Zalo', 'Telegram', 'Lark'];
      if (action === 'create') {
        const name = String(record?.name || '').trim(), phone = String(record?.phone || '').trim(), channel = String(record?.channel || '').trim();
        if (!name || !phone || !channels.includes(channel)) return send(res, 400, { error: 'Vui lòng nhập đủ tên, số điện thoại và kênh làm việc hợp lệ.' });
        const highest = rows.reduce((max, row) => Math.max(max, Number(String(row.code || '').replace(/^KTT-/, '')) || 0), 0);
        const groups = Array.isArray(record?.groups) ? record.groups.map(group => ({ name: String(group?.name || '').trim().slice(0, 300), link: String(group?.link || '').trim().slice(0, 1000), channel })).filter(group => group.name) : [];
        const productType = ['HÀNG CN', 'HÀNG CK'].includes(String(record?.productType || '')) ? String(record.productType) : '';
        const item = { id: crypto.randomUUID(), code: `KTT-${String(highest + 1).padStart(5, '0')}`, customerCode: String(record?.customerCode || '').trim().slice(0, 100), productType, name: name.slice(0, 150), phone: phone.slice(0, 50), status: 'Đang hoạt động', channel, groups, priceVersions: [{ id: crypto.randomUUID(), freightPrice: String(record?.price || '').trim().slice(0, 300), fees: String(record?.fees || '').trim().slice(0, 500), effectiveDate: crmNewToday(), reason: 'Thiết lập ban đầu', createdBy: user.name, createdAt: new Date().toISOString(), isCurrent: true }], issues: [], payments: [], note: String(record?.note || '').trim().slice(0, 4000), salesOwner: String(user.sale || user.name).trim().slice(0, 100), orderCount: 0, lifetimeRevenue: 0, outstandingDebt: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        rows.unshift(item); saveCustomerManagementRows(rows); return send(res, 201, { record: item });
      }
      const item = rows.find(row => row.id === id);
      if (!item) return send(res, 404, { error: 'Không tìm thấy khách hàng.' });
      if (action === 'status') {
        const status = String(record?.status || ''); if (!['Đang hoạt động', 'Đã dừng gửi hàng'].includes(status)) return send(res, 400, { error: 'Tình trạng khách hàng không hợp lệ.' });
        item.status = status; item.updatedAt = new Date().toISOString(); saveCustomerManagementRows(rows); return send(res, 200, { record: item });
      }
      if (action === 'productType') {
        const productType = String(record?.productType || ''); if (!['HÀNG CN', 'HÀNG CK'].includes(productType)) return send(res, 400, { error: 'Mảng hàng không hợp lệ.' });
        item.productType = productType; item.updatedAt = new Date().toISOString(); saveCustomerManagementRows(rows); return send(res, 200, { record: item });
      }
      if (action === 'addPrice') {
        const freightPrice = String(record?.freightPrice || '').trim(); if (!freightPrice) return send(res, 400, { error: 'Vui lòng nhập giá cước.' });
        item.priceVersions = Array.isArray(item.priceVersions) ? item.priceVersions : []; item.priceVersions.forEach(version => { version.isCurrent = false; });
        item.priceVersions.unshift({ id: crypto.randomUUID(), freightPrice: freightPrice.slice(0, 300), fees: String(record?.fees || '').trim().slice(0, 500), effectiveDate: String(record?.effectiveDate || crmNewToday()).slice(0, 10), reason: String(record?.reason || '').trim().slice(0, 1000), createdBy: user.name, createdAt: new Date().toISOString(), isCurrent: true });
        item.updatedAt = new Date().toISOString(); saveCustomerManagementRows(rows); return send(res, 200, { record: item });
      }
      if (action === 'addIssue') {
        const content = String(record?.content || '').trim(); if (!content) return send(res, 400, { error: 'Vui lòng nhập nội dung vấn đề.' });
        item.issues = Array.isArray(item.issues) ? item.issues : []; item.issues.push({ id: crypto.randomUUID(), content: content.slice(0, 4000), createdBy: user.name, createdAt: new Date().toISOString() });
        item.updatedAt = new Date().toISOString(); saveCustomerManagementRows(rows); return send(res, 200, { record: item });
      }
      return send(res, 400, { error: 'Thao tác quản lý khách hàng không hợp lệ.' });
    } catch (error) { return send(res, 500, { error: error.message || 'Không thể lưu dữ liệu khách hàng.' }); }
  }
  if (pathname === '/api/customs-coordination' && req.method === 'GET') {
    if (!canUseCustoms(user)) return send(res, user ? 403 : 401, { error: 'Bạn chưa được phân quyền sử dụng Khai Báo HQ.' });
    try {
      const query = new URL(req.url, 'https://dashboard.local').searchParams;
      const term = String(query.get('reference') || '').trim().toLocaleLowerCase('vi-VN');
      const references = term ? customsReferences().filter(row => `${row.hsCode || row[1] || ''} ${row.goodsName || row[2] || ''}`.toLocaleLowerCase('vi-VN').includes(term)).slice(0, 15) : [];
      const visibleRows = customsVisibleRows(user, customsRows());
      const warehouseView = query.get('view') === 'warehouse';
      if (warehouseView && !canImportCustomsWarehouse(user)) return send(res, 403, { error: 'Bạn không có quyền quản lý dữ liệu Nhập kho TQ.' });
      return send(res, 200, { rows: warehouseView ? visibleRows : visibleRows.filter(row => row.status !== 'returned_to_customer'), references, settings: customsSettings(), user: profile(user) });
    } catch (error) { return send(res, 500, { error: error.message || 'Không thể tải dữ liệu Khai Báo HQ.' }); }
  }
  if (pathname === '/api/customs-documents/export' && req.method === 'GET') {
    if (!canUseCustoms(user)) return send(res, user ? 403 : 401, { error: 'Bạn chưa được phân quyền xuất Chứng Từ HQ.' });
    try {
      const batchId = String(new URL(req.url, 'https://dashboard.local').searchParams.get('batchId') || '').trim();
      if (!batchId) return send(res, 400, { error: 'Vui lòng chọn một chuyến xe đã bốc.' });
      const rows = customsVisibleRows(user, customsRows());
      const loading = rows.flatMap(row => row.loadingRecords || []).find(item => item.batchId === batchId);
      if (!loading) return send(res, 404, { error: 'Không tìm thấy chuyến xe trong phạm vi dữ liệu của bạn.' });
      const buffer = await buildCustomsWorkbook({ templatePath: customsExcelTemplateFile, shipments: rows, batchId, exchangeRate: customsSettings().exchangeRateUsdVnd });
      const safeTruck = String(loading.truckCode || 'xe').replace(/[^\p{L}\p{N}._-]+/gu, '-');
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`Chung-tu-HQ-${safeTruck}-${loading.loadingDate || ''}.xlsx`)}`,
        'Content-Length': buffer.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      return res.end(buffer);
    } catch (error) { return send(res, 400, { error: error.message || 'Không thể tạo file Chứng Từ HQ.' }); }
  }
  if (pathname === '/api/customs-coordination' && req.method === 'POST') {
    if (!canUseCustoms(user)) return send(res, user ? 403 : 401, { error: 'Bạn chưa được phân quyền sử dụng Khai Báo HQ.' });
    try {
      const { action, id, record } = await readJson(req), rows = customsRows();
      const privileged = user.role === 'admin';
      const team = leaderTeam(user);
      const canWarehouse = privileged || user.role === 'manager' || user.role === 'warehouse_cn' || user.role === 'cn_operations';
      const canCustoms = privileged || user.role === 'customs_declaration';
      const canAccounting = privileged || user.role === 'accountant';
      if (action === 'update_exchange_rate') {
        if (!canCustoms) return send(res, 403, { error: 'Chỉ Khai báo HQ hoặc Admin được cập nhật tỉ giá.' });
        const rate = numeric(record?.exchangeRateUsdVnd);
        if (!(rate > 0)) return send(res, 400, { error: 'Tỉ giá USD/VND phải lớn hơn 0.' });
        const settings = customsSettings(), now = new Date().toISOString();
        settings.exchangeRateUsdVnd = rate; settings.exchangeRateUpdatedAt = now; settings.exchangeRateUpdatedBy = user.name;
        settings.history = Array.isArray(settings.history) ? settings.history : [];
        settings.history.push({ id: crypto.randomUUID(), rate, actorId: user.id, actor: user.name, createdAt: now });
        saveCustomsSettings(settings);
        const rows = customsRows();
        rows.forEach(shipment => {
          shipment.customsLines = (shipment.customsLines || []).map(cleanCustomsLine);
          if (shipment.customsLines.length) customsHistory(shipment, user, 'exchange_rate_recalculated', shipment.status, shipment.status, `Cập nhật tỉ giá USD/VND ${rate.toLocaleString('en-US')}; hệ thống tính lại các khoản thuế.`);
        });
        saveCustomsRows(rows); return send(res, 200, { settings });
      }
      if (action === 'bulk_import_warehouse') {
        if (!canWarehouse) return send(res, 403, { error: 'Chỉ Kho TQ hoặc Quản lý được nhập bảng hàng về kho.' });
        const incoming = Array.isArray(record?.rows) ? record.rows.slice(0, 1000) : [];
        if (!incoming.length) return send(res, 400, { error: 'Chưa có dòng dữ liệu hợp lệ để lưu.' });
        const existingCodes = [...new Set(incoming.map(item => String(item?.cargoCode || '').trim()).filter(code => rows.some(row => normalized(row.cargoCode) === normalized(code))))];
        if (existingCodes.length) return send(res, 409, { error: `Mã hàng đã có trên hệ thống: ${existingCodes.join(', ')}. Vui lòng bỏ các mã trùng trước khi lưu.`, duplicateCodes: existingCodes });
        const seen = new Set();
        const importedAt = new Date().toISOString();
        let created = 0, updated = 0;
        for (const item of incoming) {
          const cargoCode = String(item?.cargoCode || '').trim().slice(0, 80);
          if (!cargoCode || seen.has(normalized(cargoCode))) continue;
          seen.add(normalized(cargoCode));
          const sourceRow = {
            operationDate: customsOperationalDate(item?.operationDate),
            cargoCode,
            packageCount: customsNumber(item?.packageCount),
            productName: String(item?.productName || '').trim().slice(0, 500),
            customerCode: String(item?.customerCode || '').trim().slice(0, 80),
            ownerName: String(item?.ownerName || '').trim().slice(0, 150),
            saleOwner: String(item?.saleOwner || '').trim().slice(0, 150),
            saleTeam: String(item?.saleTeam || '').trim().slice(0, 40),
            accountant: String(item?.accountant || '').trim().slice(0, 120),
            weightKg: customsNumber(item?.weightKg),
            volumeM3: customsNumber(item?.volumeM3)
          };
          if (!sourceRow.ownerName || !Number.isFinite(vietnameseDateStamp(sourceRow.operationDate))) continue;
          const createdShipment = {
            id: crypto.randomUUID(), ...sourceRow, lotCode: '', source: 'warehouse_paste', dataEpoch: customsDataEpoch, status: 'sale_required', documentStatus: 'Chưa kiểm tra',
            createdAt: importedAt, updatedAt: importedAt,
            saleProductLines: [{ id: crypto.randomUUID(), lineNumber: 1, description: sourceRow.productName || '', packageCount: sourceRow.packageCount, productsPerPackage: '', productSize: '', declarationQuantity: 0, declarationUnit: 'PCE', invoicePriceBeforeVat: '', note: '', images: [] }],
            customsLines: [], supplementRequests: [], discussions: [], history: []
          };
          customsHistory(createdShipment, user, 'import_warehouse_paste', '', 'sale_required', `Kho TQ nhập từ bảng dán ngày ${sourceRow.operationDate}.`);
          rows.unshift(createdShipment); created += 1;
        }
        if (!created && !updated) return send(res, 400, { error: 'Không có dòng nào đủ thông tin để lưu. Cần tối thiểu Ngày, Mã hàng và Chủ hàng.' });
        saveCustomsRows(rows); customsWarehouseSyncCache = { expiresAt: 0 };
        return send(res, 200, { ok: true, created, updated, total: created + updated });
      }
      if (action === 'create') {
        return send(res, 400, { error: 'Mã hàng chỉ được tạo bằng Nhập dữ liệu hàng về kho TQ.' });
      }
      const shipment = rows.find(row => row.id === id);
      if (!shipment) return send(res, 404, { error: 'Không tìm thấy mã hàng.' });
      if (action === 'add_discussion') {
        if (!customsVisibleRows(user, rows).some(row => row.id === shipment.id)) return send(res, 403, { error: 'Bạn không có quyền trao đổi trên mã hàng này.' });
        const content = String(record?.content || '').trim().slice(0, 4000);
        if (!content) return send(res, 400, { error: 'Vui lòng nhập nội dung trao đổi.' });
        shipment.discussions = Array.isArray(shipment.discussions) ? shipment.discussions : [];
        const message = { id: crypto.randomUUID(), actorId: user.id, actor: user.name, actorRole: customsActorRole(user), content, createdAt: new Date().toISOString() };
        shipment.discussions.push(message);
        if (shipment.discussions.length > 300) shipment.discussions = shipment.discussions.slice(-300);
        shipment.updatedAt = message.createdAt;
        customsHistory(shipment, user, 'discussion_message', shipment.status, shipment.status, `Trao đổi nội bộ: ${content}`);
        saveCustomsRows(rows); return send(res, 200, { record: shipment, message });
      }
      if (action === 'update_warehouse') {
        if (!canWarehouse) return send(res, 403, { error: 'Chỉ Điều vận Kho TQ hoặc Quản lý được sửa Mã hàng, KG và M³.' });
        const cargoCode = String(record?.cargoCode || '').trim().slice(0, 80), weightKg = customsNumber(record?.weightKg), volumeM3 = customsNumber(record?.volumeM3);
        if (!cargoCode) return send(res, 400, { error: 'Mã hàng không được để trống.' });
        if (rows.some(row => row.id !== shipment.id && normalized(row.cargoCode) === normalized(cargoCode))) return send(res, 409, { error: `Mã hàng ${cargoCode} đã có trên hệ thống.` });
        if (weightKg < 0 || volumeM3 < 0) return send(res, 400, { error: 'KG và M³ không được nhỏ hơn 0.' });
        const before = { cargoCode: shipment.cargoCode, weightKg: shipment.weightKg, volumeM3: shipment.volumeM3 };
        shipment.cargoCode = cargoCode; shipment.weightKg = weightKg; shipment.volumeM3 = volumeM3; shipment.updatedAt = new Date().toISOString();
        const changes = customsChangedFields(before, shipment, { cargoCode: 'Mã hàng', weightKg: 'KG', volumeM3: 'M³' });
        customsHistory(shipment, user, 'warehouse_update', shipment.status, shipment.status, `Điều chỉnh ${changes}: Mã hàng ${before.cargoCode || '—'} → ${cargoCode}; KG ${before.weightKg || 0} → ${weightKg}; M³ ${before.volumeM3 || 0} → ${volumeM3}.`);
        saveCustomsRows(rows); return send(res, 200, { record: shipment });
      }
      if (action === 'return_to_customer') {
        if (!canWarehouse) return send(res, 403, { error: 'Chỉ Điều vận Kho TQ hoặc Quản lý được trả hàng cho khách.' });
        if (shipment.status === 'loaded') return send(res, 409, { error: 'Mã hàng đã bốc hết lên xe, không thể chuyển sang Trả lại khách hàng.' });
        const reason = String(record?.reason || '').trim().slice(0, 1000);
        if (!reason) return send(res, 400, { error: 'Vui lòng nhập lý do trả lại khách hàng.' });
        const from = shipment.status; shipment.statusBeforeCustomerReturn = from; shipment.status = 'returned_to_customer'; shipment.returnedToCustomerReason = reason; shipment.returnedToCustomerAt = new Date().toISOString(); shipment.updatedAt = shipment.returnedToCustomerAt;
        customsHistory(shipment, user, 'return_to_customer', from, shipment.status, `Trả lại khách hàng: ${reason}`);
        saveCustomsRows(rows); return send(res, 200, { record: shipment });
      }
      if (action === 'restore_customer_return') {
        if (!canWarehouse) return send(res, 403, { error: 'Chỉ Điều vận Kho TQ hoặc Quản lý được khôi phục mã hàng.' });
        if (shipment.status !== 'returned_to_customer') return send(res, 409, { error: 'Mã hàng không ở trạng thái Trả lại khách hàng.' });
        const from = shipment.status, restored = ['sale_required', 'customs_pending', 'customer_confirmation', 'ready_for_loading'].includes(shipment.statusBeforeCustomerReturn) ? shipment.statusBeforeCustomerReturn : 'sale_required';
        shipment.status = restored; shipment.updatedAt = new Date().toISOString(); customsHistory(shipment, user, 'restore_customer_return', from, restored, 'Khôi phục mã hàng vào quy trình xử lý.');
        saveCustomsRows(rows); return send(res, 200, { record: shipment });
      }
      const managesShipment = Boolean(team && (normalized(shipment.saleTeam) === normalized(team) || normalized(shipment.saleOwner).startsWith(normalized(team))));
      const owns = sameSale(shipment.saleOwner, user.sale) || sameSale(shipment.saleOwner, user.name);
      if (action === 'save_sale' || action === 'save_sale_draft') {
        if (!(privileged || managesShipment || (user.role === 'sale' && owns))) return send(res, 403, { error: 'Chỉ Sale phụ trách hoặc Trưởng phòng trực tiếp được cập nhật thông tin hàng.' });
        const draft = action === 'save_sale_draft';
        if (!draft && shipment.status !== 'sale_required') return send(res, 409, { error: 'Thông tin Sale đã gửi và đang bị khóa. Hãy tạo yêu cầu sửa đổi.' });
        if (draft && shipment.status !== 'sale_required') return send(res, 409, { error: 'Thông tin Sale đã khóa, không thể lưu nháp.' });
        const productLines = Array.isArray(record?.productLines) ? record.productLines.slice(0, 300).map((line, index) => ({ id: String(line?.id || crypto.randomUUID()), lineNumber: index + 1, description: String(line?.description || '').trim().slice(0, 200), packageCount: numeric(line?.packageCount), productsPerPackage: String(line?.productsPerPackage || '').trim().slice(0, 100), productSize: String(line?.productSize || '').trim().slice(0, 300), declarationQuantity: numeric(line?.declarationQuantity), declarationUnit: String(line?.declarationUnit || '').trim().slice(0, 30), invoicePriceBeforeVat: String(line?.invoicePriceBeforeVat || '').trim().slice(0, 100), note: String(line?.note || '').trim().slice(0, 1000), sourceColumns: Array.isArray(line?.sourceColumns) ? line.sourceColumns.slice(0, 30).map((column, columnIndex) => ({ id: String(column?.id || `col-${columnIndex + 1}`).slice(0, 80), label: String(column?.label || '').trim().slice(0, 160) })).filter(column => column.label) : [], extraFields: Array.isArray(line?.extraFields) ? line.extraFields.slice(0, 30).map(field => ({ id: String(field?.id || crypto.randomUUID()), label: String(field?.label || '').trim().slice(0, 160), value: String(field?.value || '').trim().slice(0, 1000) })).filter(field => field.label) : [], images: Array.isArray(line?.images) ? line.images.slice(0, 10).map(image => ({ id: String(image?.id || crypto.randomUUID()), url: String(image?.url || '').trim().slice(0, 500000), fileName: String(image?.fileName || '').trim().slice(0, 255), mimeType: String(image?.mimeType || '').trim().slice(0, 100), createdAt: new Date().toISOString() })).filter(image => image.url) : [] })).filter(line => line.description) : [];
        if (!productLines.length) return send(res, 400, { error: 'Cần có ít nhất một dòng sản phẩm có mô tả.' });
        const before = { saleProductLines: shipment.saleProductLines };
        const from = shipment.status; shipment.saleProductLines = productLines;
        if (!draft) { shipment.status = 'customs_pending'; shipment.saleLockedAt = new Date().toISOString(); shipment.saleLockedBy = user.name; }
        shipment.updatedAt = new Date().toISOString();
        customsHistory(shipment, user, draft ? 'sale_draft' : 'sale_submit', from, shipment.status, `${draft ? 'Sale lưu nháp' : 'Sale gửi chính thức'} ${productLines.length} dòng; thay đổi: ${customsChangedFields(before, shipment, { saleProductLines: 'Thông tin Sale' })}.`);
        saveCustomsRows(rows); return send(res, 200, { record: shipment });
      }
      if (action === 'request_supplement') {
        if (!canCustoms) return send(res, 403, { error: 'Chỉ bộ phận Khai báo hải quan được yêu cầu bổ sung.' });
        const content = String(record?.content || '').trim(); if (!content) return send(res, 400, { error: 'Vui lòng ghi nội dung cần Sale bổ sung.' });
        const from = shipment.status; shipment.supplementRequests = Array.isArray(shipment.supplementRequests) ? shipment.supplementRequests : []; shipment.supplementRequests.push({ id: crypto.randomUUID(), shipmentId: shipment.id, requestedBy: user.id, content: content.slice(0, 4000), status: 'open', createdAt: new Date().toISOString() }); shipment.status = 'sale_required'; shipment.updatedAt = new Date().toISOString(); customsHistory(shipment, user, 'request_supplement', from, shipment.status, content); saveCustomsRows(rows); return send(res, 200, { record: shipment });
      }
      if (action === 'save_customs' || action === 'save_customs_draft') {
        if (!canCustoms) return send(res, 403, { error: 'Chỉ bộ phận Khai báo hải quan được lên list khai báo.' });
        const draft = action === 'save_customs_draft';
        if (shipment.status !== 'customs_pending') return send(res, 409, { error: 'List khai báo chưa đến lượt xử lý hoặc đã gửi và đang bị khóa.' });
        const lines = Array.isArray(record?.customsLines) ? record.customsLines.slice(0, 300).map(cleanCustomsLine).filter(line => line.goodsDescription || line.hsCode) : [];
        if (!lines.length) return send(res, 400, { error: 'Cần có ít nhất một dòng khai báo.' });
        const before = { customsLines: shipment.customsLines };
        const from = shipment.status; shipment.customsLines = lines;
        if (!draft) { shipment.status = 'customer_confirmation'; shipment.customsLockedAt = new Date().toISOString(); shipment.customsLockedBy = user.name; }
        shipment.updatedAt = new Date().toISOString();
        customsHistory(shipment, user, draft ? 'customs_draft' : 'customs_submit', from, shipment.status, `${draft ? 'Khai báo lưu nháp' : 'Khai báo gửi chính thức'} ${lines.length} dòng; thay đổi: ${customsChangedFields(before, shipment, { customsLines: 'List khai báo' })}.`);
        saveCustomsRows(rows); return send(res, 200, { record: shipment });
      }
      if (action === 'request_change') {
        const stage = String(record?.stage || '');
        const reason = String(record?.reason || '').trim().slice(0, 4000);
        if (!reason) return send(res, 400, { error: 'Vui lòng ghi rõ lý do yêu cầu sửa đổi.' });
        if (stage === 'sale') {
          if (!canCustoms && !privileged) return send(res, 403, { error: 'Chỉ Khai báo HQ hoặc Admin được trả Thông tin Sale để sửa.' });
          if (!['customs_pending', 'customer_confirmation'].includes(shipment.status)) return send(res, 409, { error: 'Không thể trả bước Sale ở trạng thái hiện tại.' });
          const from = shipment.status; shipment.status = 'sale_required'; delete shipment.saleLockedAt; delete shipment.saleLockedBy;
          shipment.updatedAt = new Date().toISOString(); customsHistory(shipment, user, 'request_change_sale', from, shipment.status, `Yêu cầu sửa đổi Thông tin Sale: ${reason}`);
        } else if (stage === 'customs') {
          if (!canCustoms) return send(res, 403, { error: 'Chỉ Khai báo HQ hoặc Admin được mở lại List khai báo.' });
          if (!['customer_confirmation', 'ready_for_loading'].includes(shipment.status)) return send(res, 409, { error: 'Không thể mở lại List khai báo ở trạng thái hiện tại.' });
          const from = shipment.status; shipment.status = 'customs_pending'; delete shipment.customsLockedAt; delete shipment.customsLockedBy;
          shipment.updatedAt = new Date().toISOString(); customsHistory(shipment, user, 'request_change_customs', from, shipment.status, `Yêu cầu sửa đổi List khai báo: ${reason}`);
        } else return send(res, 400, { error: 'Phần dữ liệu cần sửa không hợp lệ.' });
        saveCustomsRows(rows); return send(res, 200, { record: shipment });
      }
      if (action === 'customer_approved' || action === 'customer_requests_edit') {
        if (!canCustoms) return send(res, 403, { error: 'Chỉ bộ phận Khai báo hải quan được xác nhận khách.' });
        if (shipment.status !== 'customer_confirmation') return send(res, 409, { error: 'Mã hàng chưa ở bước Khai báo xác nhận.' });
        const from = shipment.status, approved = action === 'customer_approved'; shipment.status = approved ? 'ready_for_loading' : 'customs_pending'; shipment.updatedAt = new Date().toISOString(); customsHistory(shipment, user, action, from, shipment.status, approved ? 'Khai báo xác nhận khách; sẵn sàng xếp xe.' : String(record?.content || 'Khai báo ghi nhận yêu cầu chỉnh sửa thông tin.').slice(0, 4000)); saveCustomsRows(rows); return send(res, 200, { record: shipment });
      }
      if (action === 'assign_truck') {
        if (!(privileged || ['truck_planner', 'cn_operations'].includes(user.role))) return send(res, 403, { error: 'Chỉ Điều vận Xếp Xe CN hoặc Admin được tạo danh sách bốc xe.' });
        const truckCode = String(record?.truckCode || '').trim().slice(0, 80);
        const loadingDate = String(record?.loadingDate || '').trim().slice(0, 10);
        const assignments = Array.isArray(record?.assignments) ? record.assignments.slice(0, 500) : [];
        if (!truckCode || !/^\d{4}-\d{2}-\d{2}$/.test(loadingDate) || !assignments.length) return send(res, 400, { error: 'Vui lòng nhập mã xe, ngày bốc và chọn ít nhất một mã hàng.' });
        const prepared = [];
        for (const assignment of assignments) {
          const item = rows.find(row => row.id === String(assignment?.id || ''));
          // Điều vận có thể xếp xe ngay sau khi Sale đã gửi thông tin cho Khai báo.
          // Không buộc chờ bước Khai báo xác nhận khách; hàng bị trả về Sale vẫn bị loại.
          if (!item || !['customs_pending', 'customer_confirmation', 'ready_for_loading'].includes(item.status)) return send(res, 409, { error: 'Có mã hàng chưa được Sale gửi cho Khai báo hoặc không còn đủ điều kiện xếp xe. Vui lòng cập nhật lại danh sách.' });
          item.loadingRecords = Array.isArray(item.loadingRecords) ? item.loadingRecords : [];
          const loadedPacks = item.loadingRecords.reduce((sum, entry) => sum + customsNumber(entry.packageCount), 0);
          const loadedM3 = item.loadingRecords.reduce((sum, entry) => sum + customsNumber(entry.volumeM3), 0);
          const remainingPacks = Math.max(0, customsNumber(item.packageCount) - loadedPacks);
          const remainingM3 = Math.max(0, customsNumber(item.volumeM3) - loadedM3);
          const packageCount = customsNumber(assignment?.packageCount);
          const volumeM3 = customsNumber(assignment?.volumeM3);
          if (!(packageCount > 0) || packageCount > remainingPacks + 0.000001 || (remainingM3 > 0 && !(volumeM3 > 0)) || volumeM3 > remainingM3 + 0.000001) return send(res, 400, { error: `Số kiện hoặc m³ bốc của ${item.cargoCode} không hợp lệ hoặc vượt quá lượng còn lại.` });
          prepared.push({ item, packageCount, volumeM3 });
        }
        const now = new Date().toISOString(), batchId = crypto.randomUUID();
        for (const entry of prepared) {
          const loading = { id: crypto.randomUUID(), batchId, truckCode, loadingDate, packageCount: entry.packageCount, volumeM3: entry.volumeM3, note: String(record?.note || '').trim().slice(0, 1000), actorId: user.id, actor: user.name, createdAt: now };
          entry.item.loadingRecords.push(loading);
          const totalLoadedPacks = entry.item.loadingRecords.reduce((sum, item) => sum + customsNumber(item.packageCount), 0);
          const totalLoadedM3 = entry.item.loadingRecords.reduce((sum, item) => sum + customsNumber(item.volumeM3), 0);
          const complete = totalLoadedPacks >= customsNumber(entry.item.packageCount) - 0.000001;
          const from = entry.item.status;
          // Với hàng đang chờ Khai báo/khách xác nhận, giữ nguyên luồng xử lý sau khi
          // xếp xe để Khai báo vẫn tiếp tục làm list. Luồng cũ "sẵn sàng xếp xe" vẫn
          // chuyển sang "đã xếp" khi bốc đủ hàng.
          if (entry.item.status === 'ready_for_loading' && complete) entry.item.status = 'loaded';
          entry.item.updatedAt = now;
          customsHistory(entry.item, user, complete ? 'truck_loaded' : 'truck_partially_loaded', from, entry.item.status, `Bốc ${entry.packageCount} kiện, ${entry.volumeM3} m³ lên xe ${truckCode}, ngày ${loadingDate}.`);
        }
        saveCustomsRows(rows); return send(res, 200, { ok: true, batchId, updated: prepared.length });
      }
      if (action === 'revert_loading') {
        if (!(privileged || ['truck_planner', 'cn_operations'].includes(user.role))) return send(res, 403, { error: 'Chỉ Điều vận Xếp Xe CN hoặc Admin được hoàn tác bốc xe.' });
        const loadingId = String(record?.loadingId || '');
        shipment.loadingRecords = Array.isArray(shipment.loadingRecords) ? shipment.loadingRecords : [];
        const index = shipment.loadingRecords.findIndex(entry => entry.id === loadingId);
        if (index < 0) return send(res, 404, { error: 'Không tìm thấy lần bốc xe cần hoàn tác.' });
        const [removed] = shipment.loadingRecords.splice(index, 1), from = shipment.status;
        if (shipment.status === 'loaded') shipment.status = 'ready_for_loading';
        shipment.updatedAt = new Date().toISOString();
        customsHistory(shipment, user, 'truck_loading_reverted', from, shipment.status, `Trả ${removed.packageCount} kiện, ${removed.volumeM3} m³ từ xe ${removed.truckCode} về danh sách chờ xếp.`);
        saveCustomsRows(rows); return send(res, 200, { record: shipment });
      }
      if (action === 'document_status') {
        if (!canAccounting) return send(res, 403, { error: 'Chỉ Kế toán được cập nhật chứng từ.' });
        shipment.documentStatus = String(record?.documentStatus || '').slice(0, 100); shipment.updatedAt = new Date().toISOString(); customsHistory(shipment, user, 'document_check', shipment.status, shipment.status, `Kế toán cập nhật chứng từ: ${shipment.documentStatus}`); saveCustomsRows(rows); return send(res, 200, { record: shipment });
      }
      return send(res, 400, { error: 'Thao tác Khai Báo HQ không hợp lệ.' });
    } catch (error) { return send(res, 500, { error: error.message || 'Không thể lưu dữ liệu Khai Báo HQ.' }); }
  }
  if (pathname === '/api/session') return user ? send(res, 200, { user: profile(user) }) : send(res, 401, { error: 'Chưa đăng nhập.' });
  if (pathname === '/crm-new-lark.html') {
    if (!user) { res.writeHead(302, { Location: '/login' }); return res.end(); }
    if (user.role !== 'admin') return send(res, 403, 'Chỉ Admin được cấu hình báo cáo Lark.', 'text/plain; charset=utf-8');
    return fs.readFile(path.join(publicDir, 'crm-new-lark.html'), (error, content) => error ? send(res, 500, 'Không thể tải cấu hình báo cáo Lark.', 'text/plain; charset=utf-8') : send(res, 200, content, 'text/html; charset=utf-8'));
  }
  if (pathname === '/crm-new.html') {
    if (!user) { res.writeHead(302, { Location: '/login' }); return res.end(); }
    if (isCustomsOnlyUser(user)) { res.writeHead(302, { Location: '/khaibaohaiquan' }); return res.end(); }
    const appVersion = Math.floor(fs.statSync(path.join(publicDir, 'crm-new-app.js')).mtimeMs);
    return fs.readFile(path.join(publicDir, 'crm-new.html'), 'utf8', (error, content) => error ? send(res, 500, 'Không thể tải CRM Mới.', 'text/plain; charset=utf-8') : send(res, 200, content.replace('</body>', `<script src="/crm-new-dashboard-link.js?v=${appVersion}"></script><script src="/crm-new-app.js?v=${appVersion}"></script></body>`), 'text/html; charset=utf-8'));
  }
  if (pathname === '/accounting-entry-demo.html') {
    if (!user) { res.writeHead(302, { Location: '/login' }); return res.end(); }
    if (!canUseAccountingDemo(user)) return send(res, 403, 'Chỉ Admin hoặc Kế toán được sử dụng khu vực nhập liệu.', 'text/plain; charset=utf-8');
    return fs.readFile(path.join(publicDir, 'accounting-entry-demo.html'), (error, content) => error ? send(res, 500, 'Không thể tải trang nhập liệu demo.', 'text/plain; charset=utf-8') : send(res, 200, content, 'text/html; charset=utf-8'));
  }
  if (pathname === '/customer-management.html') {
    if (!user) { res.writeHead(302, { Location: '/login' }); return res.end(); }
    if (!canUseCustomerManagement(user)) return send(res, 403, 'Giai đoạn này chỉ Admin được sử dụng Quản lý Khách hàng.', 'text/plain; charset=utf-8');
    return fs.readFile(path.join(publicDir, 'customer-management.html'), (error, content) => error ? send(res, 500, 'Không thể tải Quản lý Khách hàng.', 'text/plain; charset=utf-8') : send(res, 200, content, 'text/html; charset=utf-8'));
  }
  if (pathname === '/customs-coordination.html') {
    res.writeHead(302, { Location: '/khaibaohaiquan' }); return res.end();
  }
  if (pathname === '/khaibaohaiquan') {
    if (!user) { res.writeHead(302, { Location: '/login' }); return res.end(); }
    if (!canUseCustoms(user)) return send(res, 403, 'Bạn chưa được phân quyền sử dụng Khai Báo HQ.', 'text/plain; charset=utf-8');
    return fs.readFile(path.join(publicDir, 'customs-coordination.html'), 'utf8', (error, content) => error ? send(res, 500, 'Không thể tải Khai Báo HQ.', 'text/plain; charset=utf-8') : send(res, 200, content, 'text/html; charset=utf-8'));
  }
  if (pathname === '/warehouse-cn-import.html') {
    if (!user) { res.writeHead(302, { Location: '/login' }); return res.end(); }
    if (!canImportCustomsWarehouse(user)) return send(res, 403, 'Chỉ Kho TQ hoặc Quản lý được nhập dữ liệu hàng về kho.', 'text/plain; charset=utf-8');
    return fs.readFile(path.join(publicDir, 'warehouse-cn-import.html'), (error, content) => error ? send(res, 500, 'Không thể tải trang nhập kho TQ.', 'text/plain; charset=utf-8') : sendFrameAsset(res, 200, content));
  }
  if (pathname === '/modules/ktt-customs/KTT-dieu-phoi-khai-bao-xep-xe.html') {
    if (!user) { res.writeHead(302, { Location: '/login' }); return res.end(); }
    if (!canUseCustoms(user)) return send(res, 403, 'Bạn chưa được phân quyền sử dụng Khai Báo HQ.', 'text/plain; charset=utf-8');
    return fs.readFile(path.join(publicDir, 'modules', 'ktt-customs', 'KTT-dieu-phoi-khai-bao-xep-xe.html'), (error, content) => {
      if (error) return send(res, 500, 'Không thể tải module Khai Báo HQ.', 'text/plain; charset=utf-8');
      const encodeForSrcdoc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
      const sessionBridge = encodeForSrcdoc(fs.readFileSync(path.join(publicDir, 'modules', 'ktt-customs', 'live-session-bridge.js'), 'utf8'));
      const processingWorkspace = encodeForSrcdoc(fs.readFileSync(path.join(publicDir, 'modules', 'ktt-customs', 'processing-workspace.js'), 'utf8'));
      const saleSupplementWorkspace = encodeForSrcdoc(fs.readFileSync(path.join(publicDir, 'modules', 'ktt-customs', 'sale-supplement-workspace.js'), 'utf8'));
      const customsListWorkspace = encodeForSrcdoc(fs.readFileSync(path.join(publicDir, 'modules', 'ktt-customs', 'customs-list-workspace.js'), 'utf8'));
      const discussionWorkspace = encodeForSrcdoc(fs.readFileSync(path.join(publicDir, 'modules', 'ktt-customs', 'discussion-workspace.js'), 'utf8'));
      const imagePreview = encodeForSrcdoc(fs.readFileSync(path.join(publicDir, 'modules', 'ktt-customs', 'image-preview.js'), 'utf8'));
      const overviewWorkspace = encodeForSrcdoc(fs.readFileSync(path.join(publicDir, 'modules', 'ktt-customs', 'overview-workspace.js'), 'utf8'));
      const truckLoadingWorkspace = encodeForSrcdoc(fs.readFileSync(path.join(publicDir, 'modules', 'ktt-customs', 'truck-loading-workspace.js'), 'utf8'));
      const customsDocumentsWorkspace = encodeForSrcdoc(fs.readFileSync(path.join(publicDir, 'modules', 'ktt-customs', 'customs-documents-workspace.js'), 'utf8'));
      const warehouseWorkspace = canImportCustomsWarehouse(user) ? encodeForSrcdoc(fs.readFileSync(path.join(publicDir, 'modules', 'ktt-customs', 'warehouse-workspace.js'), 'utf8')) : '';
      content = content.toString('utf8')
        // The locked handoff uses a nested srcdoc iframe.  Permit it to call
        // the same-origin API so its view and actions use the real session.
        .replace('sandbox="allow-scripts"', 'sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"')
        .replace('script-src &#x27;unsafe-inline&#x27;', 'script-src &#x27;self&#x27; &#x27;unsafe-inline&#x27;')
        .replaceAll('connect-src blob: data:', 'connect-src &#x27;self&#x27; blob: data:')
        .replaceAll('img-src blob: data:', 'img-src &#x27;self&#x27; blob: data:')
        .replace('const data=[', 'const data=window.KTT_CUSTOMS_DATA=[')
        .replace(';render();\n    })();', ';window.KTT_CUSTOMS_RENDER=render;render();\n    })();')
        // Drafts, locks and correction requests are enforced by the live API
        // bridge. Remove the legacy browser-only layers to avoid duplicate
        // buttons and localStorage state diverging between computers.
        .replace('&lt;script src=&quot;/modules/ktt-customs/draft-lock.js&quot;&gt;&lt;/script&gt;', '')
        .replace('&lt;script src=&quot;/modules/ktt-customs/workflow-safety.js&quot;&gt;&lt;/script&gt;', '')
        .replace('&lt;/body&gt;', `&lt;script&gt;${sessionBridge}&lt;/script&gt;&lt;script&gt;${processingWorkspace}&lt;/script&gt;&lt;script&gt;${saleSupplementWorkspace}&lt;/script&gt;&lt;script&gt;${customsListWorkspace}&lt;/script&gt;&lt;script&gt;${imagePreview}&lt;/script&gt;&lt;script&gt;${overviewWorkspace}&lt;/script&gt;&lt;script&gt;${truckLoadingWorkspace}&lt;/script&gt;&lt;script&gt;${customsDocumentsWorkspace}&lt;/script&gt;${warehouseWorkspace ? `&lt;script&gt;${warehouseWorkspace}&lt;/script&gt;` : ''}&lt;script&gt;${discussionWorkspace}&lt;/script&gt;&lt;/body&gt;`);
      if (canImportCustomsWarehouse(user)) {
        const importPopupScript = encodeForSrcdoc(fs.readFileSync(path.join(publicDir, 'modules', 'ktt-customs', 'import-popup.js'), 'utf8'));
        content = content
          .replace('&lt;button&gt;&lt;span class=&quot;ico&quot;&gt;⌂&lt;/span&gt;&lt;span&gt;Tổng quan&lt;/span&gt;&lt;/button&gt;', '&lt;button&gt;&lt;span class=&quot;ico&quot;&gt;⌂&lt;/span&gt;&lt;span&gt;Tổng quan&lt;/span&gt;&lt;/button&gt;&lt;button id=&quot;cf-import-open&quot;&gt;&lt;span class=&quot;ico&quot;&gt;▤&lt;/span&gt;&lt;span&gt;Nhập kho TQ&lt;/span&gt;&lt;/button&gt;')
          .replace(`&lt;script&gt;${sessionBridge}&lt;/script&gt;`, `&lt;script&gt;${importPopupScript}&lt;/script&gt;&lt;script&gt;${sessionBridge}&lt;/script&gt;`);
      }
      return sendFrameAsset(res, 200, content);
    });
  }
  if (pathname === '/api/data') { if (!user) return send(res, 401, { error: 'Vui lòng đăng nhập.' }); if (isCustomsOnlyUser(user)) return send(res, 403, { error: 'Tài khoản này chỉ được sử dụng khu vực Khai Báo HQ.' }); try { const query = new URL(req.url, 'https://dashboard.local').searchParams, report = query.get('report') === 'ck' ? 'ck' : 'cn', scope = query.get('scope') === 'team' ? 'team' : 'personal'; return send(res, 200, { user: profile(user), report, scope, data: await dashboardData(user, report, scope) }); } catch (error) { console.error(`Dashboard API failed: ${error.message}`); return send(res, 502, { error: error.message || 'Không thể tải dữ liệu Dashboard.' }); } }
  if (pathname === '/login' && !user) return fs.readFile(path.join(publicDir, 'login.html'), (error, content) => error ? send(res, 500, 'Không thể tải trang đăng nhập.', 'text/plain; charset=utf-8') : send(res, 200, content, 'text/html; charset=utf-8'));
  if (!user) { res.writeHead(302, { Location: '/login' }); return res.end(); }
  // Customs declarants work in an isolated module.  Keep the management dashboard
  // and its source data inaccessible even when the root URL is entered manually.
  if (isCustomsOnlyUser(user) && (pathname === '/' || pathname === '/index.html')) {
    res.writeHead(302, { Location: '/khaibaohaiquan' });
    return res.end();
  }
  if (pathname.startsWith('/uploads/customs-sale-images/')) {
    const fileName = path.basename(pathname);
    if (!fileName || fileName !== pathname.slice('/uploads/customs-sale-images/'.length)) return send(res, 403, 'Không được phép truy cập tệp này.', 'text/plain; charset=utf-8');
    const filePath = [saleImagePublicDir, legacySaleImagePublicDir]
      .map(directory => path.join(directory, fileName))
      .find(candidate => fs.existsSync(candidate));
    return fs.readFile(filePath || path.join(saleImagePublicDir, fileName), (error, content) => error ? send(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Không tìm thấy ảnh hàng.' : 'Không thể tải ảnh hàng.', 'text/plain; charset=utf-8') : send(res, 200, content, types[path.extname(filePath).toLowerCase()] || 'application/octet-stream'));
  }
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(publicDir, relativePath);
  if (!filePath.startsWith(`${publicDir}${path.sep}`) && filePath !== path.join(publicDir, 'index.html')) return send(res, 403, 'Không được phép truy cập tệp này.', 'text/plain; charset=utf-8');
  fs.readFile(filePath, (error, content) => error ? send(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Không tìm thấy trang.' : 'Không thể tải trang.', 'text/plain; charset=utf-8') : send(res, 200, content, types[path.extname(filePath).toLowerCase()] || 'application/octet-stream'));
}).listen(port, () => console.log(`Dashboard đang chạy tại http://localhost:${port}`));

scheduleCrmNewBackup();
crmLarkReporter.start();
