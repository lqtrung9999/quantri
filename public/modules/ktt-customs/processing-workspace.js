(() => {
  'use strict';

  const root = document.getElementById('customs-flow-app');
  const main = root?.querySelector('.cf-main');
  const originalContent = root?.querySelector('.cf-content');
  if (!root || !main || !originalContent) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const n = value => Number(String(value ?? '').replace(/[,\s]/g, '')) || 0;
  const fmt = value => value === '' || value == null ? '' : n(value).toLocaleString('en-US', { maximumFractionDigits: 4 });
  const numericFields = new Set(['packs', 'productsPerPack', 'qty', 'qty1', 'price', 'amount', 'importRate', 'importTax', 'vatRate', 'vatTax', 'totalTax']);
  const roleCanSale = user => Boolean(user && (['admin', 'manager'].includes(user.role) || user.role === 'sale'));
  const roleCanCustoms = user => Boolean(user && ['admin', 'customs_declaration'].includes(user.role));
  const statusLabel = status => ({ sale_required: 'Chờ Sale bổ sung', customs_pending: 'Chờ Khai báo lên list', customer_confirmation: 'Chờ Khai báo xác nhận', ready_for_loading: 'Sẵn sàng xếp xe' }[status] || status || 'Chưa xác định');
  const normText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  function similarDeclared(value) {
    const query = normText(value), words = [...new Set(query.split(' ').filter(word => word.length > 2))];
    if (query.length < 8 || words.length < 2) return [];
    return (window.KTT_DECLARED_DATA || []).map(row => { const description = normText(row[2]), known = new Set(description.split(' ').filter(word => word.length > 2)); const common = words.filter(word => known.has(word)).length; const score = common / Math.max(3, Math.min(words.length, known.size)) + (description.includes(query.slice(0, Math.min(24, query.length))) ? .35 : 0); return { row, score }; }).filter(match => match.score >= .42).sort((a, b) => b.score - a.score).slice(0, 3);
  }
  const saleFields = [
    ['description', 'Tên SP / công dụng / chất liệu / model', 'text'], ['packs', 'Số kiện', 'number'],
    ['productsPerPack', 'SP/kiện', 'text'], ['size', 'Kích thước', 'text'], ['qty', 'SL khai báo', 'number'],
    ['unit', 'Đơn vị khai báo', 'text'], ['invoicePrice', 'Giá HĐ trước VAT', 'text'], ['note', 'Ghi chú Sale', 'text']
  ];
  const customsFields = [
    ['en', 'Tên tiếng Anh', 'text'], ['vi', 'Mô tả hàng hóa', 'text'], ['note', 'NOTE', 'text'],
    ['invoicePrice', 'Giá XHĐ trước thuế', 'text'], ['hs', 'Mã HS', 'text'], ['qty1', 'Số lượng khai báo', 'number'], ['unit1', 'Đơn vị khai báo', 'text'],
    ['price', 'Giá khai USD', 'number'], ['amount', 'Tổng USD', 'readonly'], ['importRate', 'Thuế NK %', 'number'],
    ['importTax', 'Thuế NK', 'readonly'], ['vatRate', 'VAT %', 'number'], ['vatTax', 'Thuế VAT', 'readonly'], ['totalTax', 'Tổng thuế VNĐ', 'readonly']
  ];
  const customerVatTax = line => n(line.invoicePrice) * n(line.qty1) * n(line.vatRate) / 100;
  const customerTotalTax = line => n(line.importTax) + customerVatTax(line);
  const confirmationFields = [
    ['Mã hàng', (item) => item.code], ['STT', (_, line, index) => index + 1], ['Mô tả hàng hóa', (_, line) => line.vi],
    ['Giá XHĐ trước thuế', (_, line) => line.invoicePrice], ['Số lượng khai báo', (_, line) => fmt(line.qty1)],
    ['Đơn vị khai báo', (_, line) => line.unit1], ['Thuế NK %', (_, line) => fmt(line.importRate)], ['Thuế NK', (_, line) => fmt(line.importTax)],
    ['VAT (%)', (_, line) => fmt(line.vatRate)], ['Thuế VAT', (_, line) => fmt(customerVatTax(line))], ['Tổng thuế (VNĐ)', (_, line) => fmt(customerTotalTax(line))]
  ];

  const workspace = document.createElement('section');
  workspace.id = 'cf-processing-workspace';
  workspace.hidden = true;
  workspace.innerHTML = `
    <div class="xp-head"><div><h1>Xử Lý Khai Báo</h1><p>Nhập liệu Sale và Khai báo trên cùng một bảng. Các cột nhận diện được giữ cố định khi cuộn ngang.</p></div><button id="xp-back" class="cf-action">← Danh sách công việc</button></div><div class="xp-rate"></div><div class="xp-kpis"></div>
    <div class="xp-tools"><div class="xp-search"><span>⌕</span><input id="xp-search" placeholder="Tìm mã hàng, mã khách, tên hàng, Sale..."></div><select id="xp-status"><option value="">Mọi trạng thái</option><option value="sale_required">Chờ Sale bổ sung</option><option value="customs_pending">Chờ Khai báo lên list</option><option value="customer_confirmation">Chờ xác nhận</option><option value="ready_for_loading">Sẵn sàng xếp xe</option></select><button id="xp-refresh" class="cf-action">↻ Cập nhật</button></div>
    <div id="xp-summary" class="xp-summary"></div><div id="xp-list" class="xp-list"></div>
    <input id="xp-excel-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
    <div id="xp-excel-modal" class="xp-excel-modal" hidden><div class="xp-excel-dialog"><div class="xp-excel-head"><div><h2>Kiểm tra dữ liệu Excel</h2><p id="xp-excel-file-name"></p></div><button type="button" class="xp-excel-close">×</button></div><div class="xp-excel-options"><label>Cách nhập<select id="xp-excel-mode"><option value="replace">Thay danh sách Sale hiện tại</option><option value="append">Thêm vào cuối danh sách hiện tại</option></select></label><label>Đơn vị giá trong file<select id="xp-excel-currency"><option value="none">Không nhập giá</option><option value="vnd">VNĐ</option><option value="usd">USD – quy đổi theo tỉ giá hôm nay</option></select></label></div><div id="xp-excel-summary" class="xp-excel-summary"></div><div class="xp-excel-preview"><table><thead><tr><th>#</th><th>Mã/Model</th><th>Tên hàng</th><th>Công dụng – chất liệu</th><th>Kích thước</th><th>Số lượng</th><th>Đơn vị</th><th>Giá file</th></tr></thead><tbody id="xp-excel-preview-body"></tbody></table></div><div class="xp-excel-foot"><span>Dữ liệu chỉ được đưa vào biểu mẫu. Sale vẫn cần kiểm tra và bấm Lưu nháp hoặc Lưu và gửi Khai báo.</span><div><button type="button" class="cf-action xp-excel-close">Hủy</button><button type="button" class="cf-action primary" id="xp-excel-apply">Đưa dữ liệu vào list Sale</button></div></div></div></div>`;
  main.appendChild(workspace);

  const navButtons = [...root.querySelectorAll('.cf-nav button')];
  const processingButton = navButtons.find(button => /Đơn hàng/i.test(button.textContent || ''));
  const overviewButton = navButtons.find(button => /Tổng quan/i.test(button.textContent || ''));
  const coordinationButton = navButtons.find(button => /Khai báo\s*&\s*xếp xe/i.test(button.textContent || ''));
  if (processingButton) processingButton.innerHTML = '<span class="ico">▣</span><span>Xử Lý Khai Báo</span>';
  function bindOriginalKpis() {
    const values = ['sale', 'customs', 'customer', 'ready', 'ready'], filter = root.querySelector('#cf-status-filter');
    root.querySelectorAll('.cf-kpis .cf-kpi').forEach((card, index) => {
      card.setAttribute('role', 'button'); card.tabIndex = 0; card.dataset.filterStatus = values[index] || '';
      const activate = () => { if (!filter) return; filter.value = card.dataset.filterStatus; filter.dispatchEvent(new Event('change', { bubbles: true })); root.querySelectorAll('.cf-kpis .cf-kpi').forEach(item => item.classList.toggle('ktt-active', item === card)); };
      card.onclick = activate; card.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } };
    });
    filter?.addEventListener('change', () => root.querySelectorAll('.cf-kpis .cf-kpi').forEach(card => card.classList.toggle('ktt-active', card.dataset.filterStatus === filter.value)));
  }
  bindOriginalKpis();

  function session() { return window.KTT_CUSTOMS_SESSION || {}; }
  function rows() { return Array.isArray(window.KTT_CUSTOMS_DATA) ? window.KTT_CUSTOMS_DATA : []; }
  function unitSelect(field, value, editable, scope, rowIndex) {
    const units = ['Cái', 'Bộ', 'Kg', 'Cuộn', 'Túi', 'Quyển', 'Bó'];
    const legacy = { PCE: 'Cái', SET: 'Bộ', KGM: 'Kg', KG: 'Kg', ROL: 'Cuộn' };
    const raw = String(value || '').trim();
    const current = legacy[raw.toLocaleUpperCase('vi-VN')] || raw || 'Cái';
    const known = units.some(unit => unit.toLocaleLowerCase('vi-VN') === current.toLocaleLowerCase('vi-VN'));
    const options = [...units.map(unit => `<option value="${unit}" ${unit.toLocaleLowerCase('vi-VN') === current.toLocaleLowerCase('vi-VN') ? 'selected' : ''}>${unit}</option>`), ...(!known ? [`<option value="${esc(current)}" selected>${esc(current)}</option>`] : []), '<option value="__custom__">Nhập đơn vị khác…</option>'];
    return `<select class="xp-unit-select" data-${scope}-field="${field}" data-row="${rowIndex}" ${editable ? '' : 'disabled'}>${options.join('')}</select>`;
  }
  function input(field, value, editable, scope, rowIndex, manual = false) {
    const longText = field === 'description' || field === 'en' || field === 'vi';
    const longTextClass = field === 'description' ? 'sale-text' : field === 'en' ? 'english-text' : 'declaration-text';
    if (longText) return `<textarea class="long-text ${longTextClass}" rows="3" data-${scope}-field="${field}" data-row="${rowIndex}" ${(field === 'description' || field === 'vi') ? 'maxlength="200"' : ''} ${editable ? '' : 'disabled'}>${esc(value)}</textarea>${field === 'vi' ? `<div class="xp-match-warning" data-match-row="${rowIndex}"></div>` : ''}`;
    if (field === 'unit' || field === 'unit1') return unitSelect(field, value, editable, scope, rowIndex);
    return `<input data-${scope}-field="${field}" data-row="${rowIndex}" ${field === 'price' ? `data-manual="${manual ? '1' : '0'}"` : ''} value="${esc(numericFields.has(field) ? fmt(value) : value)}" ${editable ? '' : 'disabled'}>`;
  }
  function shipmentCard(item) {
    const user = session().user;
    const saleEditable = roleCanSale(user) && item._status === 'sale_required';
    const customsEditable = roleCanCustoms(user) && item._status === 'customs_pending';
    const count = Math.max(1, item.saleInfo?.productLines?.length || 0, item.customsLines?.length || 0);
    const lines = Array.from({ length: count }, (_, index) => ({ sale: item.saleInfo?.productLines?.[index] || {}, customs: item.customsLines?.[index] || {} }));
    if (item._status === 'customer_confirmation') {
      const confirmationLines = item.customsLines || [];
      return `<article class="xp-card xp-confirm-card" data-id="${esc(item._id)}" data-code="${esc(item.code)}"><div class="xp-card-head"><div><b>${esc(item.code)}</b><span>${esc(item.name)} · ${esc(item.customer)} · ${esc(item.owner || '')}</span></div><div><span class="xp-badge customer_confirmation">${esc(statusLabel(item._status))}</span><small>${confirmationLines.length} dòng</small></div></div><div class="xp-confirm-title"><div><b>THÔNG TIN KHAI BÁO HÀNG HÓA</b><span>Mã khách: ${esc(item.customer)} · Mã hàng: ${esc(item.code)}</span></div><button class="cf-action primary xp-download-confirm">↓ Tải ảnh PNG gửi khách</button></div><div class="xp-confirm-wrap"><table><thead><tr>${confirmationFields.map(([label]) => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${confirmationLines.map((line, index) => `<tr>${confirmationFields.map(([, get]) => `<td>${esc(get(item, line, index))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${roleCanCustoms(user) ? '<div class="xp-customer-feedback"><label>Phản hồi / yêu cầu chỉnh sửa của khách</label><textarea class="xp-customer-note" placeholder="VD: Dòng 2 cần sửa tên hàng hóa hoặc giá khai..."></textarea></div>' : ''}<div class="xp-actions"><span>Xem trước nội dung gửi khách</span><div>${roleCanCustoms(user) ? '<button class="cf-action xp-customer-edit">Khách yêu cầu chỉnh sửa</button><button class="cf-action primary xp-customer-approve">Xác nhận khách → Sẵn sàng xếp xe</button>' : ''}</div></div></article>`;
    }
    return `<article class="xp-card" data-id="${esc(item._id)}" data-code="${esc(item.code)}">
      <div class="xp-card-head"><div><b>${esc(item.code)}</b><span>${esc(item.name)} · ${esc(item.customer)} · ${esc(item.owner || '')}</span></div><div><span class="xp-badge ${esc(item._status)}">${esc(statusLabel(item._status))}</span><small>${lines.length} dòng</small></div></div>
      ${item._status === 'customs_pending' && item.customerChangeNote ? `<div class="xp-return-note"><b>↩ Nội dung khách yêu cầu chỉnh sửa</b><span>${esc(item.customerChangeNote)}</span></div>` : ''}
      ${['sale_required', 'customs_pending'].includes(item._status) && item.supplementRequest ? `<div class="xp-return-note xp-sale-note"><b>↩ Thông tin Sale cần bổ sung</b><span>${esc(item.supplementRequest)}</span></div>` : ''}
      <div class="xp-table-wrap"><table class="xp-table"><thead><tr><th class="pin code" rowspan="2">Mã hàng</th><th class="pin product" rowspan="2">Tên hàng Kho TQ</th><th colspan="${saleFields.length}" class="sale-group">THÔNG TIN SALE</th><th colspan="${customsFields.length}" class="customs-group">LIST KHAI BÁO</th><th class="xp-operation-head" rowspan="2">Thao tác</th></tr><tr>${saleFields.map(([, label]) => `<th class="sale-head">${esc(label)}</th>`).join('')}${customsFields.map(([, label]) => `<th class="customs-head">${esc(label)}</th>`).join('')}</tr></thead><tbody>
      ${lines.map((line, index) => `<tr><td class="pin code"><b>${esc(item.code)}</b><small>Dòng ${index + 1}</small></td><td class="pin product">${esc(item.name)}</td>${saleFields.map(([field]) => `<td>${input(field, line.sale[field] ?? '', saleEditable, 'sale', index)}</td>`).join('')}${customsFields.map(([field, , type]) => { const suggested = field === 'invoicePrice' ? (line.customs[field] || line.sale.invoicePrice || '') : field === 'qty1' ? (line.customs[field] || line.sale.qty || '') : field === 'unit1' ? (line.customs[field] || line.sale.unit || 'Cái') : line.customs[field] ?? ''; return `<td>${input(field, suggested, customsEditable && type !== 'readonly', 'customs', index, field === 'price' && line.customs.priceManual)}</td>`; }).join('')}<td class="xp-line-actions">${saleEditable || customsEditable ? '<button type="button" class="xp-clone-line">Nhân bản</button><button type="button" class="xp-delete-line">Xóa dòng</button>' : '—'}</td></tr>`).join('')}
      </tbody></table></div>
      ${customsEditable ? '<div class="xp-supplement-box" hidden><label>Thông tin Sale cần bổ sung</label><textarea class="xp-supplement-note" placeholder="VD: Dòng 1 máy chưa có công suất; chưa có tên nhà sản xuất; cần bổ sung ảnh tem sản phẩm..."></textarea><div><button class="cf-action primary xp-request-supplement">Gửi yêu cầu và trả về Sale</button></div></div>' : ''}
      <div class="xp-actions"><span>${saleEditable ? 'Sale đang được nhập liệu' : customsEditable ? 'Khai báo đang được nhập liệu' : 'Dữ liệu chỉ đọc ở trạng thái hiện tại'}</span><div>
      ${saleEditable ? '<button class="cf-action xp-sale-import">↑ Nhập file Excel</button><button class="cf-action xp-add-sale-line">＋ Thêm dòng Sale</button><button class="cf-action xp-sale-draft">Lưu nháp Sale</button><button class="cf-action primary xp-sale-submit">Lưu và gửi Khai báo</button>' : ''}
      ${customsEditable ? '<button class="cf-action xp-show-supplement">↩ Yêu cầu Sale bổ sung</button><button class="cf-action xp-add-customs-line">＋ Thêm dòng khai báo</button><button class="cf-action xp-customs-draft">Lưu nháp List khai báo</button><button class="cf-action primary xp-customs-submit">Lưu và báo Khai báo xác nhận</button>' : ''}
      ${roleCanCustoms(user) && item._status === 'customer_confirmation' ? '<button class="cf-action xp-customer-edit">Khách yêu cầu chỉnh sửa</button><button class="cf-action primary xp-customer-approve">Xác nhận khách → Sẵn sàng xếp xe</button>' : ''}
      </div></div></article>`;
  }
  function calculate(card) {
    const rate = n(session().settings?.exchangeRateUsdVnd);
    card.querySelectorAll('tbody tr').forEach(tr => {
      const qty = n(tr.querySelector('[data-customs-field="qty1"]')?.value);
      const invoicePrice = n(tr.querySelector('[data-customs-field="invoicePrice"]')?.value);
      const priceInput = tr.querySelector('[data-customs-field="price"]');
      const amount = tr.querySelector('[data-customs-field="amount"]');
      const importRate = n(tr.querySelector('[data-customs-field="importRate"]')?.value);
      const vatRate = n(tr.querySelector('[data-customs-field="vatRate"]')?.value);
      const suggestedPrice = rate > 0 ? Math.round((invoicePrice / rate * (98 - importRate) / 100) * 1000) / 1000 : 0;
      if (priceInput && priceInput.dataset.manual !== '1') priceInput.value = suggestedPrice ? suggestedPrice.toFixed(3) : '';
      const price = n(priceInput?.value);
      const base = qty * price * rate;
      const importTax = base * importRate / 100;
      const vatTax = (base + importTax) * vatRate / 100;
      if (amount) amount.value = qty && price ? fmt(qty * price) : '';
      const importTaxInput = tr.querySelector('[data-customs-field="importTax"]'); if (importTaxInput) importTaxInput.value = base ? fmt(importTax) : '';
      const vatTaxInput = tr.querySelector('[data-customs-field="vatTax"]'); if (vatTaxInput) vatTaxInput.value = base ? fmt(vatTax) : '';
      const totalTax = tr.querySelector('[data-customs-field="totalTax"]'); if (totalTax) totalTax.value = base ? fmt(importTax + vatTax) : '';
    });
  }
  function showDeclaredWarning(input) {
    const box = input.parentElement.querySelector('.xp-match-warning'), matches = similarDeclared(input.value);
    if (!box) return;
    if (box.dataset.dismissed === input.value) return;
    if (!matches.length) { box.classList.remove('show'); box.innerHTML = ''; return; }
    box.innerHTML = `<button type="button" class="xp-match-close">× Tắt cảnh báo</button><b>⚠ Phát hiện ${matches.length} mô tả tương tự đã từng khai</b>${matches.map(match => `<div><button type="button" data-copy-hs="${esc(match.row[1])}">HS ${esc(match.row[1])}</button> · ${esc(match.row[2])} · Đơn giá: ${esc(match.row[3])}</div>`).join('')}<small>Vui lòng kiểm tra lại mô tả và HS Code trước khi lưu.</small>`;
    box.classList.add('show');
    box.querySelector('.xp-match-close').onclick = () => { box.dataset.dismissed = input.value; box.classList.remove('show'); };
  }
  function render() {
    // Live data refreshes every five seconds. Preserve each card's horizontal
    // position so a user reading/entering the purple declaration columns is
    // never thrown back to the green Sale columns.
    const scrollPositions = new Map([...workspace.querySelectorAll('.xp-card')].map(card => [card.dataset.id, card.querySelector('.xp-table-wrap')?.scrollLeft || 0]));
    const query = workspace.querySelector('#xp-search').value.trim().toLocaleLowerCase('vi-VN');
    const wantedStatus = workspace.querySelector('#xp-status').value;
    const visible = rows().filter(item => (!wantedStatus || item._status === wantedStatus) && (!query || `${item.code} ${item.name} ${item.customer} ${item.owner} ${item.sale}`.toLocaleLowerCase('vi-VN').includes(query)));
    const counts = Object.fromEntries(['sale_required', 'customs_pending', 'customer_confirmation', 'ready_for_loading'].map(status => [status, rows().filter(item => item._status === status).length]));
    const readyVolume = rows().filter(item => item._status === 'ready_for_loading').reduce((sum, item) => sum + n(item.m3), 0);
    workspace.querySelector('.xp-kpis').innerHTML = `<button data-kpi-status="sale_required"><span>CHỜ SALE BỔ SUNG</span><b>${counts.sale_required}</b><small>Thông tin khách cung cấp</small></button><button data-kpi-status="customs_pending"><span>CHỜ KHAI BÁO HQ</span><b>${counts.customs_pending}</b><small>Đủ thông tin đầu vào</small></button><button data-kpi-status="customer_confirmation"><span>CHỜ KHÁCH XÁC NHẬN</span><b>${counts.customer_confirmation}</b><small>Khai báo đang chốt lại</small></button><button data-kpi-status="ready_for_loading"><span>SẴN SÀNG XẾP XE</span><b>${counts.ready_for_loading}</b><small>Mã hàng đã chốt</small></button><button data-kpi-status="ready_for_loading"><span>KHỐI SẴN SÀNG</span><b>${readyVolume.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} m³</b><small>Mục tiêu xe 78 m³</small></button>`;
    workspace.querySelectorAll('[data-kpi-status]').forEach(button => button.classList.toggle('active', button.dataset.kpiStatus === wantedStatus));
    workspace.querySelector('#xp-summary').textContent = `${visible.length} mã hàng · ${visible.reduce((sum, item) => sum + Math.max(1, item.saleInfo?.productLines?.length || 0), 0)} dòng sản phẩm`;
    workspace.querySelector('#xp-list').innerHTML = visible.map(shipmentCard).join('') || '<div class="xp-empty">Không có mã hàng phù hợp.</div>';
    workspace.querySelectorAll('.xp-card').forEach(card => {
      calculate(card); card.querySelectorAll('[data-customs-field="vi"]').forEach(input => { if (input.value) showDeclaredWarning(input); });
      card.querySelectorAll('textarea.long-text').forEach(centerLongTextarea);
      const wrap = card.querySelector('.xp-table-wrap'); if (wrap) wrap.scrollLeft = scrollPositions.get(card.dataset.id) || 0;
    });
  }
  function centerLongTextarea(textarea) {
    const usable = Math.max(18, Math.floor((textarea.clientWidth || 108) / 7));
    const lines = String(textarea.value || '').split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / usable)), 0);
    textarea.style.paddingTop = `${Math.max(6, (80 - Math.min(lines, 4) * 16) / 2)}px`;
  }
  function collect(card, scope, fields) {
    const rowIndexes = new Set([...card.querySelectorAll(`[data-${scope}-field]`)].map(input => Number(input.dataset.row)));
    return [...rowIndexes].sort((a, b) => a - b).map(rowIndex => Object.fromEntries(fields.map(([field]) => [field, card.querySelector(`[data-${scope}-field="${field}"][data-row="${rowIndex}"]`)?.value || ''])));
  }
  function salePayload(card) {
    return collect(card, 'sale', saleFields).map(line => ({ description: line.description, packageCount: line.packs, productsPerPackage: line.productsPerPack, productSize: line.size, declarationQuantity: line.qty, declarationUnit: line.unit, invoicePriceBeforeVat: line.invoicePrice, note: line.note, images: [] }));
  }
  function customsPayload(card) {
    return collect(card, 'customs', customsFields).map((line, index) => ({ englishName: line.en, goodsDescription: line.vi, note: line.note, invoicePriceBeforeTax: line.invoicePrice, hsCode: line.hs, quantity1: line.qty1, unit1: line.unit1, declaredPriceUsd: line.price, declaredPriceManual: card.querySelector(`[data-customs-field="price"][data-row="${index}"]`)?.dataset.manual === '1', importTaxRate: line.importRate, importTaxAmount: line.importTax, vatRate: line.vatRate, vatTaxAmount: line.vatTax, totalTaxVnd: line.totalTax }));
  }
  function appendEmptyLine(card) {
    const body = card.querySelector('.xp-table tbody'), source = body?.querySelector('tr:last-child');
    if (!body || !source) return null;
    const row = source.cloneNode(true), index = body.querySelectorAll('tr').length;
    row.querySelectorAll('[data-sale-field], [data-customs-field]').forEach(control => {
      control.dataset.row = index;
      if (control.tagName === 'SELECT') control.value = 'Cái'; else control.value = '';
      control.disabled = control.hasAttribute('data-sale-field') ? !roleCanSale(session().user) || card.querySelector('.xp-badge')?.classList.contains('customs_pending') : !roleCanCustoms(session().user) || !card.querySelector('.xp-badge')?.classList.contains('customs_pending') || ['amount', 'importTax', 'vatTax', 'totalTax'].includes(control.dataset.customsField);
    });
    row.querySelector('.pin.code small').textContent = `Dòng ${index + 1}`;
    row.querySelectorAll('.xp-match-warning').forEach(box => { box.classList.remove('show'); box.innerHTML = ''; delete box.dataset.dismissed; });
    body.appendChild(row); workspace.dataset.dirty = '1';
    const count = card.querySelectorAll('.xp-table tbody tr').length; const label = card.querySelector('.xp-card-head small'); if (label) label.textContent = `${count} dòng`;
    return row;
  }
  function reindexLines(card) {
    [...card.querySelectorAll('.xp-table tbody tr')].forEach((row, index) => {
      row.querySelectorAll('[data-sale-field], [data-customs-field]').forEach(control => { control.dataset.row = index; });
      const label = row.querySelector('.pin.code small'); if (label) label.textContent = `Dòng ${index + 1}`;
    });
    const count = card.querySelectorAll('.xp-table tbody tr').length, label = card.querySelector('.xp-card-head small'); if (label) label.textContent = `${count} dòng`;
  }
  function cloneLine(button) {
    const source = button.closest('tr'), body = source?.parentElement; if (!source || !body) return;
    const row = source.cloneNode(true), sourceControls = source.querySelectorAll('input, textarea, select'), clonedControls = row.querySelectorAll('input, textarea, select');
    sourceControls.forEach((control, index) => { if (clonedControls[index]) clonedControls[index].value = control.value; });
    body.insertBefore(row, source.nextSibling); reindexLines(button.closest('.xp-card')); workspace.dataset.dirty = '1';
  }
  function deleteLine(button) {
    const card = button.closest('.xp-card'), rows = card?.querySelectorAll('.xp-table tbody tr'); if (!card || !rows) return;
    if (rows.length <= 1) { alert('Mỗi lô hàng cần giữ lại ít nhất một dòng.'); return; }
    if (!window.confirm('Xóa dòng này khỏi danh sách đang nhập?')) return;
    button.closest('tr')?.remove(); reindexLines(card); workspace.dataset.dirty = '1';
  }
  function clearCardRows(card) {
    const body = card.querySelector('.xp-table tbody'), all = [...(body?.querySelectorAll('tr') || [])];
    all.slice(1).forEach(row => row.remove());
    all[0]?.querySelectorAll('[data-sale-field], [data-customs-field]').forEach(control => { if (control.tagName === 'SELECT') control.value = 'Cái'; else control.value = ''; });
  }
  const excelState = { card: null, lines: [], fileName: '', imagesSkipped: true };
  async function readSaleExcel(file, onProgress) {
    if (!file || file.size > 500 * 1024 * 1024) throw new Error('File Excel phải nhỏ hơn 500 MB.');
    const shipmentId = excelState.card?.dataset.id;
    if (!shipmentId) throw new Error('Không xác định được mã hàng cần nhập Excel.');
    const request = async (url, options) => {
      const response = await fetch(url, { credentials: 'same-origin', ...options });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Không thể tải file Excel.');
      return body;
    };
    const started = await request('/api/customs-sale-excel/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, fileSize: file.size, shipmentId }) });
    const chunkSize = started.chunkSize || 768 * 1024;
    for (let offset = 0, index = 0; offset < file.size; offset += chunkSize, index += 1) {
      const end = Math.min(offset + chunkSize, file.size);
      await request(`/api/customs-sale-excel/chunk?id=${encodeURIComponent(started.uploadId)}&index=${index}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file.slice(offset, end) });
      onProgress?.(Math.round(end / file.size * 100));
    }
    return request('/api/customs-sale-excel/finish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId: started.uploadId }) });
  }
  function showExcelPreview() {
    const modal = workspace.querySelector('#xp-excel-modal');
    workspace.querySelector('#xp-excel-file-name').textContent = excelState.fileName;
    workspace.querySelector('#xp-excel-summary').textContent = `${excelState.lines.length} dòng sẽ được nhập · Ảnh trong file được bỏ qua theo cấu hình.`;
    workspace.querySelector('#xp-excel-preview-body').innerHTML = excelState.lines.map((line, index) => `<tr><td>${index + 1}</td><td>${esc(line.model)}</td><td>${esc(line.name)}</td><td>${esc(line.description)}</td><td>${esc(line.size)}</td><td>${esc(line.qty)}</td><td>${esc(line.unit)}</td><td>${esc(line.price)}</td></tr>`).join('');
    modal.hidden = false;
  }
  function applyExcelLines() {
    const card = excelState.card; if (!card || !excelState.lines.length) return;
    const mode = workspace.querySelector('#xp-excel-mode').value, currency = workspace.querySelector('#xp-excel-currency').value, rate = n(session().settings?.exchangeRateUsdVnd);
    if (currency === 'usd' && !rate) { alert('Chưa có tỉ giá USD/VND hôm nay. Vui lòng nhờ bộ phận Khai báo cập nhật tỉ giá trước.'); return; }
    if (mode === 'replace') clearCardRows(card);
    let start = mode === 'append' ? card.querySelectorAll('.xp-table tbody tr').length : 0;
    while (card.querySelectorAll('.xp-table tbody tr').length < start + excelState.lines.length) appendEmptyLine(card);
    excelState.lines.forEach((line, offset) => {
      const index = start + offset, set = (field, value) => { const control = card.querySelector(`[data-sale-field="${field}"][data-row="${index}"]`); if (!control) return; const text = value == null ? '' : String(value); if (control.tagName === 'SELECT') { const option = [...control.options].find(item => item.value.toLocaleLowerCase('vi-VN') === text.toLocaleLowerCase('vi-VN')); if (option) control.value = option.value; else { const custom = document.createElement('option'); custom.value = text; custom.textContent = text; control.insertBefore(custom, control.lastElementChild); control.value = text; } } else control.value = text; };
      set('description', line.description); set('size', line.size); set('qty', fmt(line.qty)); set('unit', line.unit); set('note', line.note);
      const price = n(line.price); set('invoicePrice', currency === 'vnd' ? fmt(price) : currency === 'usd' ? fmt(price * rate) : '');
    });
    workspace.dataset.dirty = '1'; calculate(card); card.querySelectorAll('textarea.long-text').forEach(centerLongTextarea);
    workspace.querySelector('#xp-excel-modal').hidden = true; alert(`Đã đưa ${excelState.lines.length} dòng vào Thông tin Sale. Vui lòng kiểm tra các ô còn thiếu trước khi lưu.`);
  }
  function canvasLines(context, value, width, limit = 5) {
    const words = String(value || '—').split(/\s+/), lines = []; let current = '';
    words.forEach(word => { const next = current ? `${current} ${word}` : word; if (current && context.measureText(next).width > width) { if (lines.length < limit) lines.push(current); current = word; } else current = next; });
    if (current && lines.length < limit) lines.push(current); return lines;
  }
  function drawCenteredLines(context, lines, x, y, width, height, lineHeight) {
    context.textAlign = 'center'; context.textBaseline = 'middle';
    const start = y + height / 2 - (lines.length - 1) * lineHeight / 2;
    lines.forEach((text, index) => context.fillText(text, x + width / 2, start + index * lineHeight));
    context.textAlign = 'left'; context.textBaseline = 'alphabetic';
  }
  async function downloadWorkspaceConfirmation(item) {
    const lines = item.customsLines || []; if (!lines.length) throw new Error('Chưa có dữ liệu xác nhận khách.');
    const widths = [145, 55, 350, 155, 145, 145, 105, 145, 90, 145, 165], padding = 34, headerHeight = 64, scale = 2;
    const tableWidth = widths.reduce((sum, width) => sum + width, 0), measure = document.createElement('canvas').getContext('2d'); measure.font = '15px Arial';
    const layout = lines.map((line, index) => { const values = confirmationFields.map(([, get]) => String(get(item, line, index) ?? '')); return { values, height: Math.max(58, ...values.map((value, column) => canvasLines(measure, value, widths[column] - 18).length * 22 + 22)) }; });
    const canvas = document.createElement('canvas'), top = 122, footer = 64, height = top + headerHeight + layout.reduce((sum, row) => sum + row.height, 0) + footer;
    canvas.width = (tableWidth + padding * 2) * scale; canvas.height = height * scale; const context = canvas.getContext('2d'); context.scale(scale, scale); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#172033'; context.font = '700 25px Arial'; context.fillText('THÔNG TIN KHAI BÁO HÀNG HÓA', padding, 40); context.fillStyle = '#52627b'; context.font = '16px Arial'; context.fillText(`Mã khách: ${item.customer || '—'}   ·   Mã hàng: ${item.code || '—'}`, padding, 70);
    try { const response = await fetch('/logo-kim-thanh-tin-transparent.png', { credentials: 'same-origin', cache: 'force-cache' }); if (!response.ok) throw new Error('Không tải được logo'); const logo = await createImageBitmap(await response.blob()); const maxWidth = 210, maxHeight = 94, ratio = Math.min(maxWidth / logo.width, maxHeight / logo.height); const width = logo.width * ratio, imageHeight = logo.height * ratio; context.drawImage(logo, tableWidth + padding - width, 10, width, imageHeight); logo.close?.(); } catch (error) { console.warn('Không thể thêm logo vào ảnh xác nhận:', error); }
    let x = padding, y = top; context.fillStyle = '#ddd1f5'; context.fillRect(x, y, tableWidth, headerHeight); context.strokeStyle = '#b9afd5';
    confirmationFields.forEach(([label], column) => { context.strokeRect(x, y, widths[column], headerHeight); context.fillStyle = '#30294a'; context.font = '700 14px Arial'; drawCenteredLines(context, canvasLines(context, label, widths[column] - 16, 3), x, y, widths[column], headerHeight, 18); x += widths[column]; }); y += headerHeight;
    layout.forEach((row, rowIndex) => { x = padding; row.values.forEach((value, column) => { context.fillStyle = rowIndex % 2 ? '#fbfaf7' : '#fff'; context.fillRect(x, y, widths[column], row.height); context.strokeStyle = '#d9dfeb'; context.strokeRect(x, y, widths[column], row.height); context.fillStyle = '#1d2636'; context.font = '15px Arial'; drawCenteredLines(context, canvasLines(context, value, widths[column] - 18), x, y, widths[column], row.height, 22); x += widths[column]; }); y += row.height; });
    context.fillStyle = '#64738b'; context.font = '14px Arial'; context.fillText(`${lines.length} dòng khai báo · Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`, padding, y + 36);
    const link = document.createElement('a'); link.download = `xac-nhan-khai-bao-${item.code}.png`; link.href = canvas.toDataURL('image/png'); link.click();
  }
  async function save(card, action, payload, message) {
    const buttons = card.querySelectorAll('button'); buttons.forEach(button => button.disabled = true);
    try {
      const response = await fetch('/api/customs-coordination', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id: card.dataset.id, record: payload }) });
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Không thể lưu dữ liệu.');
      workspace.dataset.dirty = ''; await window.KTT_CUSTOMS_REFRESH?.(); render(); alert(message);
    } catch (error) { alert(error.message || 'Không thể lưu dữ liệu.'); buttons.forEach(button => button.disabled = false); }
  }
  function renderRate() {
    const settings = session().settings || {}, editable = roleCanCustoms(session().user);
    const html = `<div><b>Tỉ giá USD/VND hôm nay</b><small>${settings.exchangeRateUpdatedBy ? `Cập nhật bởi ${esc(settings.exchangeRateUpdatedBy)}` : 'Chưa cập nhật'}</small></div><div><input class="xp-rate-input" inputmode="decimal" value="${esc(fmt(settings.exchangeRateUsdVnd || ''))}" ${editable ? '' : 'disabled'}><button class="cf-action primary xp-rate-save" ${editable ? '' : 'disabled'}>Cập nhật tỉ giá</button></div>`;
    workspace.querySelector('.xp-rate').innerHTML = html;
    let panel = originalContent.querySelector('.xp-rate-original');
    if (!panel) { panel = document.createElement('div'); panel.className = 'xp-rate xp-rate-original'; originalContent.prepend(panel); }
    panel.innerHTML = html;
  }
  async function updateRate(panel) {
    try {
      const value = n(panel.querySelector('.xp-rate-input').value); if (!value) throw new Error('Vui lòng nhập tỉ giá USD/VND hợp lệ.');
      const response = await fetch('/api/customs-coordination', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_exchange_rate', record: { exchangeRateUsdVnd: value } }) });
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Không thể cập nhật tỉ giá.');
      await window.KTT_CUSTOMS_REFRESH?.(); renderRate(); if (!workspace.hidden) render(); alert('Đã cập nhật tỉ giá USD/VND hôm nay.');
    } catch (error) { alert(error.message || 'Không thể cập nhật tỉ giá.'); }
  }
  workspace.addEventListener('click', event => {
    const kpi = event.target.closest('[data-kpi-status]');
    if (kpi) { workspace.querySelector('#xp-status').value = kpi.dataset.kpiStatus; render(); return; }
    const card = event.target.closest('.xp-card'); if (!card) return;
    if (event.target.closest('.xp-clone-line')) { cloneLine(event.target.closest('.xp-clone-line')); return; }
    if (event.target.closest('.xp-delete-line')) { deleteLine(event.target.closest('.xp-delete-line')); return; }
    if (event.target.closest('.xp-add-sale-line') || event.target.closest('.xp-add-customs-line')) { const row = appendEmptyLine(card); row?.querySelector(event.target.closest('.xp-add-sale-line') ? '[data-sale-field="description"]' : '[data-customs-field="en"]')?.focus(); return; }
    if (event.target.closest('.xp-sale-import')) { const fileInput = workspace.querySelector('#xp-excel-file'); excelState.card = card; fileInput.value = ''; fileInput.click(); return; }
    const showSupplement = event.target.closest('.xp-show-supplement');
    if (showSupplement) { const box = card.querySelector('.xp-supplement-box'); if (box) { box.hidden = false; showSupplement.hidden = true; box.querySelector('.xp-supplement-note')?.focus(); } return; }
    const copyHs = event.target.closest('[data-copy-hs]');
    if (copyHs) { const hs = copyHs.closest('tr')?.querySelector('[data-customs-field="hs"]'); if (hs) { hs.value = copyHs.dataset.copyHs; workspace.dataset.dirty = '1'; } return; }
    if (event.target.closest('.xp-download-confirm')) { const item = rows().find(row => row._id === card.dataset.id); downloadWorkspaceConfirmation(item).catch(error => alert(error.message || 'Không thể tạo ảnh PNG.')); return; }
    if (event.target.closest('.xp-sale-draft')) save(card, 'save_sale_draft', { productLines: salePayload(card) }, 'Đã lưu nháp Thông tin Sale.');
    if (event.target.closest('.xp-sale-submit')) save(card, 'save_sale', { productLines: salePayload(card) }, 'Đã gửi bộ phận Khai báo và khóa Thông tin Sale.');
    if (event.target.closest('.xp-customs-draft')) save(card, 'save_customs_draft', { customsLines: customsPayload(card) }, 'Đã lưu nháp List khai báo.');
    if (event.target.closest('.xp-customs-submit')) save(card, 'save_customs', { customsLines: customsPayload(card) }, 'Đã gửi Khai báo xác nhận và khóa List khai báo.');
    if (event.target.closest('.xp-request-supplement')) { const note = card.querySelector('.xp-supplement-note'); const content = note?.value.trim(); if (!content) { alert('Vui lòng nhập nội dung cần Sale bổ sung.'); note?.focus(); return; } save(card, 'request_supplement', { content }, 'Đã lưu yêu cầu và trả mã hàng về Sale bổ sung.'); }
    if (event.target.closest('.xp-customer-approve')) save(card, 'customer_approved', {}, 'Đã xác nhận khách và chuyển sang Sẵn sàng xếp xe.');
    if (event.target.closest('.xp-customer-edit')) { const note = card.querySelector('.xp-customer-note'); const reason = note?.value.trim(); if (!reason) { alert('Vui lòng nhập nội dung khách yêu cầu chỉnh sửa.'); note?.focus(); return; } save(card, 'customer_requests_edit', { content: reason }, 'Đã lưu nội dung yêu cầu và trả hồ sơ về List khai báo để chỉnh sửa.'); }
  });
  workspace.querySelector('#xp-excel-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    const button = excelState.card?.querySelector('.xp-sale-import'), originalText = button?.textContent;
    try {
      if (button) { button.disabled = true; button.textContent = 'Đang tải 0%…'; }
      const result = await readSaleExcel(file, percent => { if (button) button.textContent = percent < 100 ? `Đang tải ${percent}%…` : 'Đang đọc dữ liệu…'; });
      excelState.lines = result.lines; excelState.fileName = `${file.name} · Sheet: ${result.sheetName}`; excelState.imagesSkipped = result.imagesSkipped !== false; showExcelPreview();
    } catch (error) { alert(error.message || 'Không thể đọc file Excel.'); }
    finally { if (button) { button.disabled = false; button.textContent = originalText || '↑ Nhập file Excel'; } }
  });
  workspace.querySelectorAll('.xp-excel-close').forEach(button => button.addEventListener('click', () => { workspace.querySelector('#xp-excel-modal').hidden = true; }));
  workspace.querySelector('#xp-excel-apply').addEventListener('click', applyExcelLines);
  workspace.querySelector('#xp-excel-modal').addEventListener('click', event => { if (event.target.id === 'xp-excel-modal') event.currentTarget.hidden = true; });
  const warningTimers = new WeakMap();
  workspace.addEventListener('input', event => {
    const card = event.target.closest('.xp-card'); if (!card) return;
    if (event.target.matches('[data-customs-field="price"]')) event.target.dataset.manual = event.target.value.trim() ? '1' : '0';
    workspace.dataset.dirty = '1'; calculate(card);
    if (event.target.matches('textarea.long-text')) centerLongTextarea(event.target);
    if (event.target.matches('[data-customs-field="vi"]')) { clearTimeout(warningTimers.get(event.target)); warningTimers.set(event.target, setTimeout(() => showDeclaredWarning(event.target), 250)); }
  });
  document.addEventListener('click', event => { const button = event.target.closest('.xp-rate-save'); if (button) updateRate(button.closest('.xp-rate')); });
  document.addEventListener('input', event => { const input = event.target.closest('[data-sale-field], [data-customs-field], .xp-rate-input'); const field = input?.dataset.saleField || input?.dataset.customsField || (input?.classList.contains('xp-rate-input') ? 'invoicePrice' : ''); if (input && numericFields.has(field)) { const raw = input.value.replace(/[^0-9.]/g, ''); input.value = raw ? fmt(raw) : ''; } });
  workspace.addEventListener('change', event => {
    const select = event.target.closest('.xp-unit-select');
    if (!select || select.value !== '__custom__') return;
    const custom = window.prompt('Nhập đơn vị khác:');
    if (!custom?.trim()) { select.value = 'Cái'; return; }
    const option = document.createElement('option'); option.value = custom.trim(); option.textContent = custom.trim(); option.selected = true;
    select.insertBefore(option, select.lastElementChild);
  });
  function openWorkspace() {
    originalContent.hidden = true; workspace.hidden = false; renderRate();
    navButtons.forEach(button => button.classList.remove('active')); processingButton?.classList.add('active'); render();
  }
  function closeWorkspace() {
    workspace.hidden = true; originalContent.hidden = false; renderRate();
    navButtons.forEach(button => button.classList.remove('active')); coordinationButton?.classList.add('active');
  }
  processingButton?.addEventListener('click', openWorkspace);
  overviewButton?.addEventListener('click', closeWorkspace);
  coordinationButton?.addEventListener('click', closeWorkspace);
  workspace.querySelector('#xp-back').addEventListener('click', closeWorkspace);
  workspace.querySelector('#xp-search').addEventListener('input', render);
  workspace.querySelector('#xp-status').addEventListener('change', render);
  workspace.querySelector('#xp-refresh').addEventListener('click', async () => { if (workspace.dataset.dirty === '1' && !window.confirm('Bạn đang có dữ liệu chưa lưu. Cập nhật sẽ bỏ các thay đổi này. Tiếp tục?')) return; workspace.dataset.dirty = ''; await window.KTT_CUSTOMS_REFRESH?.(); render(); });
  window.addEventListener('ktt-customs-refreshed', () => { renderRate(); if (!workspace.hidden && workspace.dataset.dirty !== '1') render(); });
  renderRate();

  const style = document.createElement('style');
  style.textContent = `
    #cf-processing-workspace{padding:18px;background:#f4f7fb;min-height:calc(100vh - 68px);color:#172033;font-size:12px}#cf-processing-workspace[hidden]{display:none!important}.xp-rate{margin:12px 0;padding:11px 14px;border:1px solid #d9e2ef;border-radius:11px;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px}.xp-rate>div{display:flex;align-items:center;gap:9px}.xp-rate small{color:#718096}.xp-rate-input{width:155px;height:35px;border:1px solid #cad6e5;border-radius:7px;padding:0 9px;font-weight:700}.xp-rate-original{margin:0 0 14px}
    .xp-head,.xp-tools,.xp-card-head,.xp-actions{display:flex;align-items:center;justify-content:space-between;gap:14px}.xp-head h1{margin:0;font-size:22px}.xp-head p{margin:4px 0 0;color:#6c7990;font-size:12px}.xp-tools{margin:14px 0 9px;padding:10px;background:#fff;border:1px solid #dfe6f0;border-radius:11px;justify-content:flex-start}.xp-search{position:relative;flex:1}.xp-search span{position:absolute;left:11px;top:8px;color:#78859a}.xp-search input{width:100%;height:34px;padding:0 10px 0 33px;border:1px solid #d6dfeb;border-radius:8px;font-size:12px}.xp-summary{color:#66758d;font-size:11px;margin:0 2px 9px}.xp-list{display:grid;gap:13px}.xp-card{background:#fff;border:1px solid #dce4ef;border-radius:13px;overflow:hidden;box-shadow:0 5px 16px #21314d0b}.xp-card-head{padding:10px 13px;border-bottom:1px solid #e3e9f2}.xp-card-head>div{display:flex;align-items:center;gap:10px}.xp-card-head b{font-size:14px}.xp-card-head span:not(.xp-badge){color:#69778e;font-size:11px}.xp-card-head small{color:#6e7c92;font-size:10px}.xp-badge{padding:6px 8px;border-radius:7px;font-size:10px;font-weight:800;background:#edf2f8;color:#53627a}.xp-badge.sale_required{background:#eaf2ff;color:#3172c2}.xp-badge.customs_pending{background:#f1ebff;color:#7251ca}.xp-badge.customer_confirmation{background:#fff0df;color:#c86b05}.xp-badge.ready_for_loading{background:#e8f7ee;color:#168254}
    .xp-table-wrap{max-width:100%;overflow:auto;border-bottom:1px solid #e0e7f0;scrollbar-gutter:stable}.xp-table{border-collapse:separate!important;border-spacing:0;min-width:3250px!important;width:max-content!important;font-size:11px!important}.xp-table th,.xp-table td{height:auto!important;padding:5px!important;border-right:1px solid #dfe6ef;border-top:1px solid #e7ecf3;background:#fff;vertical-align:top}.xp-table thead th{position:sticky;top:0;z-index:3;min-width:108px;padding:7px 6px!important;white-space:normal;font-size:11px!important}.xp-table .sale-group,.xp-table .sale-head{background:#e8f4d9!important;color:#2c4826}.xp-table .customs-group,.xp-table .customs-head{background:#eee7fb!important;color:#4e3a78}.xp-table .pin{position:sticky;z-index:4;background:#f8fafc!important}.xp-table .pin.code{left:0;min-width:112px;width:112px}.xp-table .pin.product{left:112px;min-width:150px;width:150px;box-shadow:5px 0 10px #263b5b16}.xp-table thead .pin{z-index:6}.xp-table td.pin small{display:block;margin-top:4px;color:#7b889b}.xp-table input,.xp-table textarea,.xp-table .xp-unit-select{box-sizing:border-box;width:108px;min-width:108px;height:32px;border:1px solid #cfd9e7;border-radius:6px;padding:5px 6px;font:11px/1.35 system-ui;background:#fff;color:#172033}.xp-table textarea.long-text{height:72px;resize:vertical;white-space:pre-wrap}.xp-table textarea.sale-text{width:360px;min-width:360px}.xp-table textarea.english-text{width:215px;min-width:215px;height:80px}.xp-table textarea.declaration-text{width:430px;min-width:430px;height:80px}.xp-table input:disabled,.xp-table textarea:disabled,.xp-table .xp-unit-select:disabled{border-color:transparent;background:#f3f6fa;color:#536178;opacity:1}.xp-actions{padding:9px 13px}.xp-actions>span{color:#68768c;font-size:11px}.xp-actions>div{display:flex;gap:7px}.xp-actions .cf-action,.xp-tools .cf-action,.xp-tools select{font-size:11px!important;height:34px}.xp-empty{padding:25px;text-align:center;background:#fff;border:1px solid #dce4ef;border-radius:12px;color:#738098}@media(max-width:900px){#cf-processing-workspace{padding:12px}.xp-head{align-items:flex-start}.xp-head p{max-width:620px}.xp-card-head{align-items:flex-start;flex-direction:column}}
    .xp-match-warning{position:relative;display:none;width:410px;max-height:190px;overflow:auto;margin-top:6px;padding:32px 8px 8px;border:1px solid #efb46f;border-radius:7px;background:#fff7e8;color:#8d4a0c;font-size:10px;line-height:1.45}.xp-match-warning.show{display:block}.xp-match-warning b,.xp-match-warning small{display:block}.xp-match-warning div{margin-top:5px}.xp-match-warning button{border:0;background:none;color:#d95f0a;font:inherit;font-weight:800;padding:0;cursor:pointer;text-decoration:underline}.xp-match-warning .xp-match-close{position:absolute;right:7px;top:6px;border:1px solid #e7a55a!important;border-radius:6px;background:#fff!important;color:#a64f0a!important;text-decoration:none!important;padding:3px 7px!important}
    .xp-confirm-title{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px}.xp-confirm-title>div{display:grid;gap:5px}.xp-confirm-title b{font-size:16px}.xp-confirm-title span{color:#66758d}.xp-confirm-wrap{margin:0 16px 5px;overflow:auto;border:1px solid #dce4ef;border-radius:9px}.xp-confirm-wrap table{border-collapse:collapse;min-width:1700px;width:100%;font-size:11px}.xp-confirm-wrap th{padding:10px 9px;background:#ddd1f5;color:#30294a;text-align:center;vertical-align:middle;white-space:normal;border-right:1px solid #bfb4dc}.xp-confirm-wrap td{padding:11px 9px;border-top:1px solid #dfe5ee;border-right:1px solid #e2e7ef;text-align:center;vertical-align:middle}.xp-confirm-wrap th:nth-child(3),.xp-confirm-wrap td:nth-child(3){min-width:330px;white-space:normal}.xp-confirm-card .xp-actions{border-top:1px solid #e3e9f2}
    .xp-customer-feedback{display:grid;gap:7px;margin:14px 16px;padding-top:12px;border-top:1px solid #e2e8f1}.xp-customer-feedback label{font-size:12px;font-weight:800;color:#354258}.xp-customer-feedback textarea{box-sizing:border-box;width:100%;min-height:86px;padding:11px;border:1px solid #cfd9e7;border-radius:8px;resize:vertical;font:12px/1.5 system-ui}.xp-return-note{display:grid;gap:5px;margin:11px 13px;padding:10px 12px;border:1px solid #f0b873;border-radius:8px;background:#fff6e8;color:#86450d}.xp-return-note b{font-size:11px}.xp-return-note span{font-size:12px;white-space:pre-wrap}
    .xp-supplement-box{display:grid;gap:8px;margin:13px;padding:13px;border:1px solid #efb46f;border-radius:10px;background:#fff9f1}.xp-supplement-box[hidden]{display:none!important}.xp-supplement-box label{font-size:12px;font-weight:800;color:#354258}.xp-supplement-box textarea{box-sizing:border-box;width:100%;min-height:86px;padding:11px;border:1px solid #cfd9e7;border-radius:8px;resize:vertical;font:12px/1.5 system-ui}.xp-supplement-box>div{display:flex;justify-content:flex-end}.xp-sale-note{border-color:#e9ae61;background:#fff8ed}
    .xp-excel-modal{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:18px;background:#101827b8}.xp-excel-modal[hidden]{display:none!important}.xp-excel-dialog{display:flex;flex-direction:column;width:min(1180px,96vw);max-height:92vh;background:#fff;border-radius:15px;box-shadow:0 24px 70px #0008;overflow:hidden}.xp-excel-head,.xp-excel-foot{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:14px 18px}.xp-excel-head{border-bottom:1px solid #e0e6ef}.xp-excel-head h2{margin:0;font-size:19px}.xp-excel-head p{margin:4px 0 0;color:#68768c}.xp-excel-close{border:0;background:transparent;font-size:25px;cursor:pointer}.xp-excel-options{display:flex;gap:14px;padding:13px 18px;background:#f6f8fb}.xp-excel-options label{display:grid;gap:5px;font-weight:750;color:#445269}.xp-excel-options select{min-width:245px;height:36px;border:1px solid #cbd6e5;border-radius:7px;background:#fff;padding:0 8px}.xp-excel-summary{padding:10px 18px;color:#53647d;font-weight:700}.xp-excel-preview{margin:0 18px;overflow:auto;border:1px solid #dce4ef;border-radius:9px}.xp-excel-preview table{border-collapse:collapse;min-width:1100px;width:100%}.xp-excel-preview th{position:sticky;top:0;padding:9px;background:#e8f4d9;color:#2c4826;text-align:center}.xp-excel-preview td{padding:8px;border-top:1px solid #e2e8f1;border-right:1px solid #e8edf4;vertical-align:middle}.xp-excel-preview td:nth-child(4){min-width:360px;white-space:normal}.xp-excel-foot{border-top:1px solid #e0e6ef;margin-top:14px}.xp-excel-foot>div{display:flex;gap:8px}.xp-excel-foot span{color:#65738b}
    .xp-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:0 0 13px}.xp-kpis button{min-height:112px;padding:12px;border:1px solid #dce4ef;border-radius:12px;background:#fff;color:#172033;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;cursor:pointer}.xp-kpis button:hover,.xp-kpis button:focus{border-color:#6d8fbd;box-shadow:0 0 0 2px #6d8fbd20}.xp-kpis span{font-size:12px;font-weight:850;color:#58677d}.xp-kpis b{margin:5px 0 3px;font-size:23px}.xp-kpis small{font-size:11px;font-weight:700;color:#748198}
    .xp-table th{text-align:center!important;vertical-align:middle!important;font-weight:800!important}.xp-table td{text-align:center!important;vertical-align:middle!important}.xp-table .pin.product{text-align:left!important;vertical-align:middle!important}.xp-table input,.xp-table textarea,.xp-table .xp-unit-select{height:80px!important;border:1px solid rgba(25,35,50,.32)!important;background:#fff!important;text-align:center;vertical-align:middle}.xp-table textarea.long-text{height:80px!important;min-height:80px!important;line-height:16px!important;overflow:auto}.xp-table textarea[data-sale-field="description"],.xp-table textarea[data-customs-field="en"],.xp-table textarea[data-customs-field="vi"],.xp-table input[data-sale-field="note"],.xp-table input[data-customs-field="note"]{text-align:left!important}.xp-table input:disabled,.xp-table textarea:disabled,.xp-table .xp-unit-select:disabled{background:#f0f3f7!important;color:#536178!important;border-color:rgba(25,35,50,.2)!important;opacity:1}.xp-table input:not(:disabled),.xp-table textarea:not(:disabled),.xp-table select:not(:disabled){background:#fff!important;color:#172033!important}
    .xp-operation-head{min-width:94px!important;background:#e8f4d9!important}.xp-line-actions{min-width:94px}.xp-line-actions button{display:block;width:86px;margin:4px auto;padding:7px 5px;border:1px solid #cfd9e7;border-radius:7px;background:#fff;color:#172033;font-weight:750;cursor:pointer}.xp-line-actions .xp-delete-line{color:#b73535;border-color:#e5bebe}.xp-line-actions button:hover{background:#f3f6fa}
    #customs-flow-app .cf-kpis .cf-kpi{min-height:112px;display:flex!important;flex-direction:column;align-items:center;justify-content:center;text-align:center;cursor:pointer;padding:12px!important}#customs-flow-app .cf-kpis .cf-kpi span{font-size:12px!important;font-weight:850!important;color:light-dark(#526178,#d2dae6)!important}#customs-flow-app .cf-kpis .cf-kpi b{font-size:23px!important;margin:5px 0 3px!important}#customs-flow-app .cf-kpis .cf-kpi small{font-size:11px!important;font-weight:700!important}#customs-flow-app .cf-kpis .cf-kpi:hover,#customs-flow-app .cf-kpis .cf-kpi.ktt-active{border-color:#5b82ba!important;box-shadow:0 0 0 2px #5b82ba24}
    @media(max-width:900px){.xp-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);
})();
