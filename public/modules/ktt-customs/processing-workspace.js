(() => {
  'use strict';

  const root = document.getElementById('customs-flow-app');
  const main = root?.querySelector('.cf-main');
  const originalContent = root?.querySelector('.cf-content');
  if (!root || !main || !originalContent) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const n = value => Number(String(value ?? '').replace(/[,\s]/g, '')) || 0;
  const roleCanSale = user => Boolean(user && (['admin', 'manager'].includes(user.role) || user.role === 'sale'));
  const roleCanCustoms = user => Boolean(user && ['admin', 'customs_declaration'].includes(user.role));
  const statusLabel = status => ({ sale_required: 'Chờ Sale bổ sung', customs_pending: 'Chờ Khai báo lên list', customer_confirmation: 'Chờ Khai báo xác nhận', ready_for_loading: 'Sẵn sàng xếp xe' }[status] || status || 'Chưa xác định');
  const saleFields = [
    ['description', 'Tên SP / công dụng / chất liệu / model', 'text'], ['packs', 'Số kiện', 'number'],
    ['productsPerPack', 'SP/kiện', 'text'], ['size', 'Kích thước', 'text'], ['qty', 'SL khai báo', 'number'],
    ['unit', 'ĐVT', 'text'], ['invoicePrice', 'Giá HĐ trước VAT', 'text'], ['note', 'Ghi chú Sale', 'text']
  ];
  const customsFields = [
    ['en', 'Tên tiếng Anh', 'text'], ['vi', 'Mô tả hàng hóa', 'text'], ['note', 'NOTE', 'text'],
    ['invoicePrice', 'Giá XHĐ trước thuế', 'text'], ['hs', 'Mã HS', 'text'], ['qty1', 'SL1', 'number'], ['unit1', 'ĐVT', 'text'],
    ['price', 'Giá khai USD', 'number'], ['amount', 'Tổng USD', 'readonly'], ['importRate', 'Thuế NK %', 'number'],
    ['importTax', 'Thuế NK', 'number'], ['vatRate', 'VAT %', 'number'], ['totalTax', 'Tổng thuế VNĐ', 'number']
  ];

  const workspace = document.createElement('section');
  workspace.id = 'cf-processing-workspace';
  workspace.hidden = true;
  workspace.innerHTML = `
    <div class="xp-head"><div><h1>Xử Lý Khai Báo</h1><p>Nhập liệu Sale và Khai báo trên cùng một bảng. Các cột nhận diện được giữ cố định khi cuộn ngang.</p></div><button id="xp-back" class="cf-action">← Danh sách công việc</button></div>
    <div class="xp-tools"><div class="xp-search"><span>⌕</span><input id="xp-search" placeholder="Tìm mã hàng, mã khách, tên hàng, Sale..."></div><select id="xp-status"><option value="">Mọi trạng thái</option><option value="sale_required">Chờ Sale bổ sung</option><option value="customs_pending">Chờ Khai báo lên list</option><option value="customer_confirmation">Chờ xác nhận</option><option value="ready_for_loading">Sẵn sàng xếp xe</option></select><button id="xp-refresh" class="cf-action">↻ Cập nhật</button></div>
    <datalist id="xp-unit-options"><option value="Cái"><option value="Bộ"><option value="Kg"><option value="Cuộn"><option value="Túi"><option value="Quyển"><option value="Bó"></datalist>
    <div id="xp-summary" class="xp-summary"></div><div id="xp-list" class="xp-list"></div>`;
  main.appendChild(workspace);

  const navButtons = [...root.querySelectorAll('.cf-nav button')];
  const processingButton = navButtons.find(button => /Đơn hàng/i.test(button.textContent || ''));
  const overviewButton = navButtons.find(button => /Tổng quan/i.test(button.textContent || ''));
  const coordinationButton = navButtons.find(button => /Khai báo\s*&\s*xếp xe/i.test(button.textContent || ''));
  if (processingButton) processingButton.innerHTML = '<span class="ico">▣</span><span>Xử Lý Khai Báo</span>';

  function session() { return window.KTT_CUSTOMS_SESSION || {}; }
  function rows() { return Array.isArray(window.KTT_CUSTOMS_DATA) ? window.KTT_CUSTOMS_DATA : []; }
  function input(field, value, editable, scope, rowIndex) {
    const longText = field === 'description' || field === 'en' || field === 'vi';
    const longTextClass = field === 'description' ? 'sale-text' : field === 'en' ? 'english-text' : 'declaration-text';
    if (longText) return `<textarea class="long-text ${longTextClass}" rows="3" data-${scope}-field="${field}" data-row="${rowIndex}" ${editable ? '' : 'disabled'}>${esc(value)}</textarea>`;
    const list = field === 'unit' || field === 'unit1' ? ' list="xp-unit-options"' : '';
    return `<input${list} data-${scope}-field="${field}" data-row="${rowIndex}" value="${esc(value)}" ${editable ? '' : 'disabled'}>`;
  }
  function shipmentCard(item) {
    const user = session().user;
    const saleEditable = roleCanSale(user) && item._status === 'sale_required';
    const customsEditable = roleCanCustoms(user) && item._status === 'customs_pending';
    const count = Math.max(1, item.saleInfo?.productLines?.length || 0, item.customsLines?.length || 0);
    const lines = Array.from({ length: count }, (_, index) => ({ sale: item.saleInfo?.productLines?.[index] || {}, customs: item.customsLines?.[index] || {} }));
    return `<article class="xp-card" data-id="${esc(item._id)}" data-code="${esc(item.code)}">
      <div class="xp-card-head"><div><b>${esc(item.code)}</b><span>${esc(item.name)} · ${esc(item.customer)} · ${esc(item.owner || '')}</span></div><div><span class="xp-badge ${esc(item._status)}">${esc(statusLabel(item._status))}</span><small>${lines.length} dòng</small></div></div>
      <div class="xp-table-wrap"><table class="xp-table"><thead><tr><th class="pin code" rowspan="2">Mã hàng</th><th class="pin product" rowspan="2">Tên hàng Kho TQ</th><th colspan="${saleFields.length}" class="sale-group">THÔNG TIN SALE</th><th colspan="${customsFields.length}" class="customs-group">LIST KHAI BÁO</th></tr><tr>${saleFields.map(([, label]) => `<th class="sale-head">${esc(label)}</th>`).join('')}${customsFields.map(([, label]) => `<th class="customs-head">${esc(label)}</th>`).join('')}</tr></thead><tbody>
      ${lines.map((line, index) => `<tr><td class="pin code"><b>${esc(item.code)}</b><small>Dòng ${index + 1}</small></td><td class="pin product">${esc(item.name)}</td>${saleFields.map(([field]) => `<td>${input(field, line.sale[field] ?? '', saleEditable, 'sale', index)}</td>`).join('')}${customsFields.map(([field, , type]) => `<td>${input(field, field === 'invoicePrice' ? (line.customs[field] || line.sale.invoicePrice || '') : line.customs[field] ?? '', customsEditable && type !== 'readonly', 'customs', index)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <div class="xp-actions"><span>${saleEditable ? 'Sale đang được nhập liệu' : customsEditable ? 'Khai báo đang được nhập liệu' : 'Dữ liệu chỉ đọc ở trạng thái hiện tại'}</span><div>
      ${saleEditable ? '<button class="cf-action xp-sale-draft">Lưu nháp Sale</button><button class="cf-action primary xp-sale-submit">Lưu và gửi Khai báo</button>' : ''}
      ${customsEditable ? '<button class="cf-action xp-customs-draft">Lưu nháp List khai báo</button><button class="cf-action primary xp-customs-submit">Lưu và báo Khai báo xác nhận</button>' : ''}
      </div></div></article>`;
  }
  function calculate(card) {
    card.querySelectorAll('tbody tr').forEach(tr => {
      const qty = n(tr.querySelector('[data-customs-field="qty1"]')?.value);
      const price = n(tr.querySelector('[data-customs-field="price"]')?.value);
      const amount = tr.querySelector('[data-customs-field="amount"]');
      if (amount) amount.value = qty && price ? (qty * price).toFixed(2) : '';
    });
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
      calculate(card); card.addEventListener('input', () => calculate(card));
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
    return collect(card, 'customs', customsFields).map(line => ({ englishName: line.en, goodsDescription: line.vi, note: line.note, invoicePriceBeforeTax: line.invoicePrice, hsCode: line.hs, quantity1: line.qty1, unit1: line.unit1, declaredPriceUsd: line.price, importTaxRate: line.importRate, importTaxAmount: line.importTax, vatRate: line.vatRate, totalTaxVnd: line.totalTax }));
  }
  async function save(card, action, payload, message) {
    const buttons = card.querySelectorAll('button'); buttons.forEach(button => button.disabled = true);
    try {
      const response = await fetch('/api/customs-coordination', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id: card.dataset.id, record: payload }) });
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Không thể lưu dữ liệu.');
      await window.KTT_CUSTOMS_REFRESH?.(); render(); alert(message);
    } catch (error) { alert(error.message || 'Không thể lưu dữ liệu.'); buttons.forEach(button => button.disabled = false); }
  }
  workspace.addEventListener('click', event => {
    const card = event.target.closest('.xp-card'); if (!card) return;
    if (event.target.closest('.xp-sale-draft')) save(card, 'save_sale_draft', { productLines: salePayload(card) }, 'Đã lưu nháp Thông tin Sale.');
    if (event.target.closest('.xp-sale-submit')) save(card, 'save_sale', { productLines: salePayload(card) }, 'Đã gửi bộ phận Khai báo và khóa Thông tin Sale.');
    if (event.target.closest('.xp-customs-draft')) save(card, 'save_customs_draft', { customsLines: customsPayload(card) }, 'Đã lưu nháp List khai báo.');
    if (event.target.closest('.xp-customs-submit')) save(card, 'save_customs', { customsLines: customsPayload(card) }, 'Đã gửi Khai báo xác nhận và khóa List khai báo.');
  });
  function openWorkspace() {
    originalContent.hidden = true; workspace.hidden = false;
    navButtons.forEach(button => button.classList.remove('active')); processingButton?.classList.add('active'); render();
  }
  function closeWorkspace() {
    workspace.hidden = true; originalContent.hidden = false;
    navButtons.forEach(button => button.classList.remove('active')); coordinationButton?.classList.add('active');
  }
  processingButton?.addEventListener('click', openWorkspace);
  overviewButton?.addEventListener('click', closeWorkspace);
  coordinationButton?.addEventListener('click', closeWorkspace);
  workspace.querySelector('#xp-back').addEventListener('click', closeWorkspace);
  workspace.querySelector('#xp-search').addEventListener('input', render);
  workspace.querySelector('#xp-status').addEventListener('change', render);
  workspace.querySelector('#xp-refresh').addEventListener('click', async () => { await window.KTT_CUSTOMS_REFRESH?.(); render(); });
  window.addEventListener('ktt-customs-refreshed', () => { if (!workspace.hidden) render(); });

  const style = document.createElement('style');
  style.textContent = `
    #cf-processing-workspace{padding:18px;background:#f4f7fb;min-height:calc(100vh - 68px);color:#172033;font-size:12px}#cf-processing-workspace[hidden]{display:none!important}
    .xp-head,.xp-tools,.xp-card-head,.xp-actions{display:flex;align-items:center;justify-content:space-between;gap:14px}.xp-head h1{margin:0;font-size:22px}.xp-head p{margin:4px 0 0;color:#6c7990;font-size:12px}.xp-tools{margin:14px 0 9px;padding:10px;background:#fff;border:1px solid #dfe6f0;border-radius:11px;justify-content:flex-start}.xp-search{position:relative;flex:1}.xp-search span{position:absolute;left:11px;top:8px;color:#78859a}.xp-search input{width:100%;height:34px;padding:0 10px 0 33px;border:1px solid #d6dfeb;border-radius:8px;font-size:12px}.xp-summary{color:#66758d;font-size:11px;margin:0 2px 9px}.xp-list{display:grid;gap:13px}.xp-card{background:#fff;border:1px solid #dce4ef;border-radius:13px;overflow:hidden;box-shadow:0 5px 16px #21314d0b}.xp-card-head{padding:10px 13px;border-bottom:1px solid #e3e9f2}.xp-card-head>div{display:flex;align-items:center;gap:10px}.xp-card-head b{font-size:14px}.xp-card-head span:not(.xp-badge){color:#69778e;font-size:11px}.xp-card-head small{color:#6e7c92;font-size:10px}.xp-badge{padding:6px 8px;border-radius:7px;font-size:10px;font-weight:800;background:#edf2f8;color:#53627a}.xp-badge.sale_required{background:#eaf2ff;color:#3172c2}.xp-badge.customs_pending{background:#f1ebff;color:#7251ca}.xp-badge.customer_confirmation{background:#fff0df;color:#c86b05}.xp-badge.ready_for_loading{background:#e8f7ee;color:#168254}
    .xp-table-wrap{max-width:100%;overflow:auto;border-bottom:1px solid #e0e7f0;scrollbar-gutter:stable}.xp-table{border-collapse:separate!important;border-spacing:0;min-width:3250px!important;width:max-content!important;font-size:11px!important}.xp-table th,.xp-table td{height:auto!important;padding:5px!important;border-right:1px solid #dfe6ef;border-top:1px solid #e7ecf3;background:#fff;vertical-align:top}.xp-table thead th{position:sticky;top:0;z-index:3;min-width:108px;padding:7px 6px!important;white-space:normal;font-size:11px!important}.xp-table .sale-group,.xp-table .sale-head{background:#e8f4d9!important;color:#2c4826}.xp-table .customs-group,.xp-table .customs-head{background:#eee7fb!important;color:#4e3a78}.xp-table .pin{position:sticky;z-index:4;background:#f8fafc!important}.xp-table .pin.code{left:0;min-width:112px;width:112px}.xp-table .pin.product{left:112px;min-width:150px;width:150px;box-shadow:5px 0 10px #263b5b16}.xp-table thead .pin{z-index:6}.xp-table td.pin small{display:block;margin-top:4px;color:#7b889b}.xp-table input,.xp-table textarea{box-sizing:border-box;width:108px;min-width:108px;height:32px;border:1px solid #cfd9e7;border-radius:6px;padding:5px 6px;font:11px/1.35 system-ui;background:#fff;color:#172033}.xp-table textarea.long-text{height:72px;resize:vertical;white-space:pre-wrap}.xp-table textarea.sale-text{width:360px;min-width:360px}.xp-table textarea.english-text,.xp-table textarea.declaration-text{width:430px;min-width:430px;height:80px}.xp-table input:disabled,.xp-table textarea:disabled{border-color:transparent;background:#f3f6fa;color:#536178;opacity:1}.xp-actions{padding:9px 13px}.xp-actions>span{color:#68768c;font-size:11px}.xp-actions>div{display:flex;gap:7px}.xp-actions .cf-action,.xp-tools .cf-action,.xp-tools select{font-size:11px!important;height:34px}.xp-empty{padding:25px;text-align:center;background:#fff;border:1px solid #dce4ef;border-radius:12px;color:#738098}@media(max-width:900px){#cf-processing-workspace{padding:12px}.xp-head{align-items:flex-start}.xp-head p{max-width:620px}.xp-card-head{align-items:flex-start;flex-direction:column}}
  `;
  document.head.appendChild(style);
})();
