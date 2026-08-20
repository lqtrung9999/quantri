(() => {
  'use strict';

  const endpoint = '/api/customs-coordination';
  let currentUser = null;

  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const initials = value => String(value || '').trim().split(/\s+/).filter(Boolean).slice(-2).map(word => word[0]).join('').toUpperCase() || 'KTT';
  const status = value => ({ sale_required: 'sale', customs_pending: 'customs', customer_confirmation: 'customer', ready_for_loading: 'ready' }[value] || 'sale');
  const roleTitle = user => {
    if (user.role === 'customs_declaration') return 'Khai báo HQ';
    if (user.team) return `Trưởng phòng ${user.team}`;
    if (user.role === 'sale') return 'Sale';
    if (user.role === 'warehouse_cn') return 'Kho TQ';
    if (user.role === 'accountant') return 'Kế toán';
    return user.role === 'admin' ? 'Quản trị viên' : 'Nhân viên vận hành';
  };
  const displayDate = value => {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  const mapLine = (line, index) => ({
    id: line.id || `sale-${index}`,
    description: line.description || '', qty: line.declarationQuantity || '', unit: line.declarationUnit || 'PCE',
    invoicePrice: line.invoicePriceBeforeVat || '', packs: line.packageCount || '', productsPerPack: line.productsPerPackage || '',
    size: line.productSize || '', note: line.note || '', image: line.images && line.images[0] ? line.images[0].url : ''
  });
  const mapCustomsLine = (line, index) => ({
    id: line.id || `customs-${index}`, en: line.englishName || '', vi: line.goodsDescription || '', note: line.note || '',
    invoicePrice: line.invoicePriceBeforeTax || '', hs: line.hsCode || '', qty1: line.quantity1 || '', unit1: line.unit1 || '',
    qty2: line.quantity2 || '', unit2: line.unit2 || '', price: line.declaredPriceUsd || '', packs: line.packageCount || '',
    net: line.netWeightKg || '', gross: line.grossWeightKg || '', amount: line.totalUsd || '', importRate: line.importTaxRate || '',
    importTax: line.importTaxAmount || '', vatRate: line.vatRate || '', totalTax: line.totalTaxVnd || '', charCount: (line.goodsDescription || '').length
  });
  const mapRow = row => ({
    _id: row.id, code: row.cargoCode || '', lot: row.lotCode || '', packs: Number(row.packageCount || 0), name: row.productName || '',
    customer: row.customerCode || '', owner: row.ownerName || '', sale: row.saleOwner || '', team: row.saleTeam || '',
    accounting: row.accountant || '', kg: Number(row.weightKg || 0), m3: Number(row.volumeM3 || 0), photos: 0,
    docs: row.documentStatus || 'Chưa kiểm tra', status: status(row.status),
    saleInfo: { productLines: (row.saleProductLines || []).map(mapLine) },
    customsLines: (row.customsLines || []).map(mapCustomsLine),
    supplementRequest: ((row.supplementRequests || []).filter(item => item.status === 'open').pop() || {}).content || '',
    history: (row.history || []).map(item => [displayDate(item.createdAt), item.actor || '', item.content || item.action || '', item.toStatus || ''])
  });

  function selectedShipment() {
    const title = document.querySelector('#cf-detail-title')?.textContent || '';
    const code = title.replace(/^Hồ sơ\s+/, '').split(' · ')[0].trim();
    return (window.KTT_CUSTOMS_DATA || []).find(row => row.code === code) || null;
  }
  async function request(action, id, record = {}) {
    const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, record }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Không thể lưu thay đổi.');
    return payload;
  }
  function field(row, name) { return row.querySelector(`[data-field="${name}"]`)?.value?.trim() || ''; }
  function saleLines(form) {
    return [...form.querySelectorAll('[data-line]')].map((row, index) => ({
      id: row.dataset.line || `sale-${index}`, description: field(row, 'description'), packageCount: field(row, 'packs'),
      productsPerPackage: field(row, 'productsPerPack'), productSize: field(row, 'size'), declarationQuantity: field(row, 'qty'),
      declarationUnit: field(row, 'unit'), invoicePriceBeforeVat: field(row, 'invoicePrice'), note: field(row, 'note'), images: []
    })).filter(line => line.description);
  }
  function customsLines(form) {
    return [...form.querySelectorAll('[data-custom-line]')].map((row, index) => {
      const f = name => row.querySelector(`[data-custom-field="${name}"]`)?.value?.trim() || '';
      return { id: row.dataset.customLine || `customs-${index}`, englishName: f('en'), goodsDescription: f('vi'), note: f('note'), invoicePriceBeforeTax: f('invoicePrice'), hsCode: f('hs'), quantity1: f('qty1'), unit1: f('unit1'), quantity2: f('qty2'), unit2: f('unit2'), declaredPriceUsd: f('price'), packageCount: f('packs'), netWeightKg: f('net'), grossWeightKg: f('gross'), importTaxRate: f('importRate'), importTaxAmount: f('importTax'), vatRate: f('vatRate'), totalTaxVnd: f('totalTax') };
    }).filter(line => line.goodsDescription || line.hsCode);
  }
  function allowSale() { return ['sale', 'manager', 'admin'].includes(currentUser?.role); }
  function allowCustoms() { return ['customs_declaration', 'admin'].includes(currentUser?.role); }
  function hide(element) { if (element) element.style.display = 'none'; }
  function applyRoleUi() {
    const userBox = document.querySelector('.cf-user');
    if (userBox && currentUser) userBox.innerHTML = `<span>${esc(currentUser.name)} · ${esc(roleTitle(currentUser))}</span><button id="cf-logout" class="cf-avatar" title="Đăng xuất">${esc(initials(currentUser.name))}</button>`;
    document.querySelector('#cf-logout')?.addEventListener('click', () => window.parent.postMessage({ type: 'ktt-customs-logout' }, '*'));
    if (!allowSale()) {
      document.querySelectorAll('[data-role="sale"]').forEach(hide);
      document.querySelectorAll('[data-pane="sale"]').forEach(hide);
      document.querySelector('#cf-pane-sale')?.querySelectorAll('input, textarea, select, button').forEach(item => item.disabled = true);
    }
    if (!allowCustoms()) {
      document.querySelectorAll('[data-role="customs"], [data-pane="customs"], [data-pane="confirm"], [data-pane="accounting"], #cf-declared-open, #cf-truck-open, .cf-truck-mini').forEach(hide);
      document.querySelector('#cf-pane-customs')?.querySelectorAll('input, textarea, select, button').forEach(item => item.disabled = true);
      document.querySelector('#cf-pane-confirm')?.querySelectorAll('input, textarea, select, button').forEach(item => item.disabled = true);
      document.querySelector('[data-pane="sale"]')?.click();
    }
    if (currentUser?.role === 'customs_declaration') {
      document.querySelectorAll('[data-role="warehouse"], [data-role="accounting"], [data-role="truck"], [data-pane="warehouse"], [data-pane="accounting"]').forEach(hide);
    }
  }
  async function refresh() {
    const response = await fetch(endpoint, { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Không thể tải dữ liệu phân quyền.');
    currentUser = payload.user;
    const data = window.KTT_CUSTOMS_DATA;
    if (!Array.isArray(data)) return setTimeout(refresh, 60);
    data.splice(0, data.length, ...(payload.rows || []).map(mapRow));
    if (window.KTT_CUSTOMS_RENDER) window.KTT_CUSTOMS_RENDER();
    applyRoleUi();
  }
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (form.id !== 'cf-sale-form' && form.id !== 'cf-customs-form') return;
    event.preventDefault(); event.stopImmediatePropagation();
    const shipment = selectedShipment();
    if (!shipment) return alert('Không xác định được mã hàng đang xử lý.');
    try {
      if (form.id === 'cf-sale-form') {
        if (!allowSale()) throw new Error('Bạn không có quyền cập nhật Thông tin Sale.');
        const lines = saleLines(form); if (!lines.length) throw new Error('Cần có ít nhất một dòng sản phẩm có mô tả.');
        await request('save_sale', shipment._id, { productLines: lines });
      } else {
        if (!allowCustoms()) throw new Error('Chỉ bộ phận Khai báo HQ được lên list.');
        const lines = customsLines(form); if (!lines.length) throw new Error('Cần có ít nhất một dòng khai báo.');
        await request('save_customs', shipment._id, { customsLines: lines });
      }
      await refresh(); document.querySelector('.cf-close-detail')?.click();
      alert('Đã lưu thông tin vào hệ thống.');
    } catch (error) { alert(error.message || 'Không thể lưu thay đổi.'); }
  }, true);
  document.addEventListener('click', async event => {
    const button = event.target.closest('#cf-confirm-ok, #cf-request-edit, #cf-send-supplement');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const shipment = selectedShipment();
    if (!shipment) return;
    try {
      if (!allowCustoms()) throw new Error('Chỉ bộ phận Khai báo HQ được xử lý bước này.');
      if (button.id === 'cf-confirm-ok') await request('customer_approved', shipment._id);
      if (button.id === 'cf-request-edit') await request('customer_requests_edit', shipment._id, { content: document.querySelector('#cf-customer-note')?.value || '' });
      if (button.id === 'cf-send-supplement') await request('request_supplement', shipment._id, { content: document.querySelector('#cf-supplement-note')?.value || '' });
      await refresh(); document.querySelector('.cf-close-detail')?.click();
      alert('Đã cập nhật dữ liệu.');
    } catch (error) { alert(error.message || 'Không thể cập nhật.'); }
  }, true);
  refresh().catch(error => console.error('KTT customs session bridge:', error));
})();
