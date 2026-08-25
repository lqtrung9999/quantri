(() => {
  'use strict';

  const root = document.getElementById('customs-flow-app');
  const main = root?.querySelector('.cf-main');
  const originalContent = root?.querySelector('.cf-content');
  if (!root || !main || !originalContent) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const n = value => Number(String(value ?? '').replace(/[,\s]/g, '')) || 0;
  const fmt = value => value === '' || value == null ? '' : n(value).toLocaleString('en-US', { maximumFractionDigits: 4 });
  const numericFields = new Set(['packs', 'productsPerPack', 'qty', 'invoicePrice', 'qty1', 'price', 'amount', 'importRate', 'importTax', 'vatRate', 'vatTax', 'totalTax']);
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
    ['price', 'Giá khai USD (tự tính)', 'readonly'], ['amount', 'Tổng USD', 'readonly'], ['importRate', 'Thuế NK %', 'number'],
    ['importTax', 'Thuế NK', 'readonly'], ['vatRate', 'VAT %', 'number'], ['vatTax', 'Thuế VAT', 'readonly'], ['totalTax', 'Tổng thuế VNĐ', 'readonly']
  ];
  const confirmationFields = [
    ['Mã hàng', (item) => item.code], ['STT', (_, line, index) => index + 1], ['Mô tả hàng hóa', (_, line) => line.vi],
    ['Giá XHĐ trước thuế', (_, line) => fmt(line.invoicePrice)], ['Số lượng khai báo', (_, line) => fmt(line.qty1)],
    ['Đơn vị khai báo', (_, line) => line.unit1], ['Thuế NK %', (_, line) => fmt(line.importRate)], ['Thuế NK', (_, line) => fmt(line.importTax)],
    ['VAT (%)', (_, line) => fmt(line.vatRate)], ['Thuế VAT', (_, line) => fmt(line.vatTax)], ['Tổng thuế (VNĐ)', (_, line) => fmt(line.totalTax)]
  ];

  const workspace = document.createElement('section');
  workspace.id = 'cf-processing-workspace';
  workspace.hidden = true;
  workspace.innerHTML = `
    <div class="xp-head"><div><h1>Xử Lý Khai Báo</h1><p>Nhập liệu Sale và Khai báo trên cùng một bảng. Các cột nhận diện được giữ cố định khi cuộn ngang.</p></div><button id="xp-back" class="cf-action">← Danh sách công việc</button></div><div class="xp-rate"></div>
    <div class="xp-tools"><div class="xp-search"><span>⌕</span><input id="xp-search" placeholder="Tìm mã hàng, mã khách, tên hàng, Sale..."></div><select id="xp-status"><option value="">Mọi trạng thái</option><option value="sale_required">Chờ Sale bổ sung</option><option value="customs_pending">Chờ Khai báo lên list</option><option value="customer_confirmation">Chờ xác nhận</option><option value="ready_for_loading">Sẵn sàng xếp xe</option></select><button id="xp-refresh" class="cf-action">↻ Cập nhật</button></div>
    <div id="xp-summary" class="xp-summary"></div><div id="xp-list" class="xp-list"></div>`;
  main.appendChild(workspace);

  const navButtons = [...root.querySelectorAll('.cf-nav button')];
  const processingButton = navButtons.find(button => /Đơn hàng/i.test(button.textContent || ''));
  const overviewButton = navButtons.find(button => /Tổng quan/i.test(button.textContent || ''));
  const coordinationButton = navButtons.find(button => /Khai báo\s*&\s*xếp xe/i.test(button.textContent || ''));
  if (processingButton) processingButton.innerHTML = '<span class="ico">▣</span><span>Xử Lý Khai Báo</span>';

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
  function input(field, value, editable, scope, rowIndex) {
    const longText = field === 'description' || field === 'en' || field === 'vi';
    const longTextClass = field === 'description' ? 'sale-text' : field === 'en' ? 'english-text' : 'declaration-text';
    if (longText) return `<textarea class="long-text ${longTextClass}" rows="3" data-${scope}-field="${field}" data-row="${rowIndex}" ${editable ? '' : 'disabled'}>${esc(value)}</textarea>${field === 'vi' ? `<div class="xp-match-warning" data-match-row="${rowIndex}"></div>` : ''}`;
    if (field === 'unit' || field === 'unit1') return unitSelect(field, value, editable, scope, rowIndex);
    return `<input data-${scope}-field="${field}" data-row="${rowIndex}" value="${esc(numericFields.has(field) ? fmt(value) : value)}" ${editable ? '' : 'disabled'}>`;
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
      <div class="xp-table-wrap"><table class="xp-table"><thead><tr><th class="pin code" rowspan="2">Mã hàng</th><th class="pin product" rowspan="2">Tên hàng Kho TQ</th><th colspan="${saleFields.length}" class="sale-group">THÔNG TIN SALE</th><th colspan="${customsFields.length}" class="customs-group">LIST KHAI BÁO</th></tr><tr>${saleFields.map(([, label]) => `<th class="sale-head">${esc(label)}</th>`).join('')}${customsFields.map(([, label]) => `<th class="customs-head">${esc(label)}</th>`).join('')}</tr></thead><tbody>
      ${lines.map((line, index) => `<tr><td class="pin code"><b>${esc(item.code)}</b><small>Dòng ${index + 1}</small></td><td class="pin product">${esc(item.name)}</td>${saleFields.map(([field]) => `<td>${input(field, line.sale[field] ?? '', saleEditable, 'sale', index)}</td>`).join('')}${customsFields.map(([field, , type]) => { const suggested = field === 'invoicePrice' ? (line.customs[field] || line.sale.invoicePrice || '') : field === 'qty1' ? (line.customs[field] || line.sale.qty || '') : field === 'unit1' ? (line.customs[field] || line.sale.unit || 'Cái') : line.customs[field] ?? ''; return `<td>${input(field, suggested, customsEditable && type !== 'readonly', 'customs', index)}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div>
      ${customsEditable ? '<div class="xp-supplement-box"><label>Thông tin Sale cần bổ sung</label><textarea class="xp-supplement-note" placeholder="VD: Dòng 1 máy chưa có công suất; chưa có tên nhà sản xuất; cần bổ sung ảnh tem sản phẩm..."></textarea><div><button class="cf-action primary xp-request-supplement">Gửi yêu cầu và trả về Sale</button></div></div>' : ''}
      <div class="xp-actions"><span>${saleEditable ? 'Sale đang được nhập liệu' : customsEditable ? 'Khai báo đang được nhập liệu' : 'Dữ liệu chỉ đọc ở trạng thái hiện tại'}</span><div>
      ${saleEditable ? '<button class="cf-action xp-sale-draft">Lưu nháp Sale</button><button class="cf-action primary xp-sale-submit">Lưu và gửi Khai báo</button>' : ''}
      ${customsEditable ? '<button class="cf-action xp-customs-draft">Lưu nháp List khai báo</button><button class="cf-action primary xp-customs-submit">Lưu và báo Khai báo xác nhận</button>' : ''}
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
      const price = rate > 0 ? Math.round((invoicePrice / rate * (98 - importRate) / 100) * 1000) / 1000 : 0;
      if (priceInput) priceInput.value = price ? price.toFixed(3) : '';
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
    if (!matches.length) { box.classList.remove('show'); box.innerHTML = ''; return; }
    box.innerHTML = `<b>⚠ Phát hiện ${matches.length} mô tả tương tự đã từng khai</b>${matches.map(match => `<div><button type="button" data-copy-hs="${esc(match.row[1])}">HS ${esc(match.row[1])}</button> · ${esc(match.row[2])} · Đơn giá: ${esc(match.row[3])}</div>`).join('')}<small>Vui lòng kiểm tra lại mô tả và HS Code trước khi lưu.</small>`;
    box.classList.add('show');
  }
  function render() {
    // Live data refreshes every five seconds. Preserve each card's horizontal
    // position so a user reading/entering the purple declaration columns is
    // never thrown back to the green Sale columns.
    const scrollPositions = new Map([...workspace.querySelectorAll('.xp-card')].map(card => [card.dataset.id, card.querySelector('.xp-table-wrap')?.scrollLeft || 0]));
    const query = workspace.querySelector('#xp-search').value.trim().toLocaleLowerCase('vi-VN');
    const wantedStatus = workspace.querySelector('#xp-status').value;
    const visible = rows().filter(item => (!wantedStatus || item._status === wantedStatus) && (!query || `${item.code} ${item.name} ${item.customer} ${item.owner} ${item.sale}`.toLocaleLowerCase('vi-VN').includes(query)));
    workspace.querySelector('#xp-summary').textContent = `${visible.length} mã hàng · ${visible.reduce((sum, item) => sum + Math.max(1, item.saleInfo?.productLines?.length || 0), 0)} dòng sản phẩm`;
    workspace.querySelector('#xp-list').innerHTML = visible.map(shipmentCard).join('') || '<div class="xp-empty">Không có mã hàng phù hợp.</div>';
    workspace.querySelectorAll('.xp-card').forEach(card => {
      calculate(card); card.querySelectorAll('[data-customs-field="vi"]').forEach(input => { if (input.value) showDeclaredWarning(input); });
      const wrap = card.querySelector('.xp-table-wrap'); if (wrap) wrap.scrollLeft = scrollPositions.get(card.dataset.id) || 0;
    });
  }
  function collect(card, scope, fields) {
    const rowIndexes = new Set([...card.querySelectorAll(`[data-${scope}-field]`)].map(input => Number(input.dataset.row)));
    return [...rowIndexes].sort((a, b) => a - b).map(rowIndex => Object.fromEntries(fields.map(([field]) => [field, card.querySelector(`[data-${scope}-field="${field}"][data-row="${rowIndex}"]`)?.value || ''])));
  }
  function salePayload(card) {
    return collect(card, 'sale', saleFields).map(line => ({ description: line.description, packageCount: line.packs, productsPerPackage: line.productsPerPack, productSize: line.size, declarationQuantity: line.qty, declarationUnit: line.unit, invoicePriceBeforeVat: line.invoicePrice, note: line.note, images: [] }));
  }
  function customsPayload(card) {
    return collect(card, 'customs', customsFields).map(line => ({ englishName: line.en, goodsDescription: line.vi, note: line.note, invoicePriceBeforeTax: line.invoicePrice, hsCode: line.hs, quantity1: line.qty1, unit1: line.unit1, declaredPriceUsd: line.price, importTaxRate: line.importRate, importTaxAmount: line.importTax, vatRate: line.vatRate, vatTaxAmount: line.vatTax, totalTaxVnd: line.totalTax }));
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
    const card = event.target.closest('.xp-card'); if (!card) return;
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
  const warningTimers = new WeakMap();
  workspace.addEventListener('input', event => {
    const card = event.target.closest('.xp-card'); if (!card) return;
    workspace.dataset.dirty = '1'; calculate(card);
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
    .xp-match-warning{display:none;width:410px;max-height:190px;overflow:auto;margin-top:6px;padding:8px;border:1px solid #efb46f;border-radius:7px;background:#fff7e8;color:#8d4a0c;font-size:10px;line-height:1.45}.xp-match-warning.show{display:block}.xp-match-warning b,.xp-match-warning small{display:block}.xp-match-warning div{margin-top:5px}.xp-match-warning button{border:0;background:none;color:#d95f0a;font:inherit;font-weight:800;padding:0;cursor:pointer;text-decoration:underline}
    .xp-confirm-title{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px}.xp-confirm-title>div{display:grid;gap:5px}.xp-confirm-title b{font-size:16px}.xp-confirm-title span{color:#66758d}.xp-confirm-wrap{margin:0 16px 5px;overflow:auto;border:1px solid #dce4ef;border-radius:9px}.xp-confirm-wrap table{border-collapse:collapse;min-width:1700px;width:100%;font-size:11px}.xp-confirm-wrap th{padding:10px 9px;background:#ddd1f5;color:#30294a;text-align:center;vertical-align:middle;white-space:normal;border-right:1px solid #bfb4dc}.xp-confirm-wrap td{padding:11px 9px;border-top:1px solid #dfe5ee;border-right:1px solid #e2e7ef;text-align:center;vertical-align:middle}.xp-confirm-wrap th:nth-child(3),.xp-confirm-wrap td:nth-child(3){min-width:330px;white-space:normal}.xp-confirm-card .xp-actions{border-top:1px solid #e3e9f2}
    .xp-customer-feedback{display:grid;gap:7px;margin:14px 16px;padding-top:12px;border-top:1px solid #e2e8f1}.xp-customer-feedback label{font-size:12px;font-weight:800;color:#354258}.xp-customer-feedback textarea{box-sizing:border-box;width:100%;min-height:86px;padding:11px;border:1px solid #cfd9e7;border-radius:8px;resize:vertical;font:12px/1.5 system-ui}.xp-return-note{display:grid;gap:5px;margin:11px 13px;padding:10px 12px;border:1px solid #f0b873;border-radius:8px;background:#fff6e8;color:#86450d}.xp-return-note b{font-size:11px}.xp-return-note span{font-size:12px;white-space:pre-wrap}
    .xp-supplement-box{display:grid;gap:8px;margin:13px;padding:13px;border:1px solid #efb46f;border-radius:10px;background:#fff9f1}.xp-supplement-box label{font-size:12px;font-weight:800;color:#354258}.xp-supplement-box textarea{box-sizing:border-box;width:100%;min-height:86px;padding:11px;border:1px solid #cfd9e7;border-radius:8px;resize:vertical;font:12px/1.5 system-ui}.xp-supplement-box>div{display:flex;justify-content:flex-end}.xp-sale-note{border-color:#e9ae61;background:#fff8ed}
  `;
  document.head.appendChild(style);
})();
