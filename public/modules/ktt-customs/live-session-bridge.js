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
  // The locked workflow renders the LIST KHAI BÁO badge from `row.customs`.
  // API data is stored as `customsLines`, so expose its first row in the
  // locked module's original shape as well.  This keeps the overview badge
  // and the detailed declaration rows in sync after a declaration is saved.
  const mapRow = row => {
    const customsLines = (row.customsLines || []).map(mapCustomsLine);
    const firstCustomsLine = customsLines[0] || null;
    const customs = firstCustomsLine ? {
      vi: firstCustomsLine.vi,
      en: firstCustomsLine.en,
      hs: firstCustomsLine.hs,
      qty: firstCustomsLine.qty1,
      unit: firstCustomsLine.unit1,
      price: firstCustomsLine.price,
      amount: firstCustomsLine.amount,
      net: firstCustomsLine.net,
      gross: firstCustomsLine.gross
    } : null;
    return {
      _id: row.id, code: row.cargoCode || '', lot: row.lotCode || '', packs: Number(row.packageCount || 0), name: row.productName || '',
      customer: row.customerCode || '', owner: row.ownerName || '', sale: row.saleOwner || '', team: row.saleTeam || '',
      accounting: row.accountant || '', kg: Number(row.weightKg || 0), m3: Number(row.volumeM3 || 0), photos: 0,
      docs: row.documentStatus || 'Chưa kiểm tra', status: status(row.status),
      _status: row.status, saleLockedAt: row.saleLockedAt || '', customsLockedAt: row.customsLockedAt || '',
      saleInfo: { productLines: (row.saleProductLines || []).map(mapLine) },
      customsLines,
      customs,
      supplementRequest: ((row.supplementRequests || []).filter(item => item.status === 'open').pop() || {}).content || '',
      history: (row.history || []).map(item => [displayDate(item.createdAt), item.actor || '', item.content || item.action || '', item.toStatus || ''])
    };
  };

  function selectedShipment() {
    const title = document.querySelector('#cf-detail-title')?.textContent || '';
    const code = title.replace(/^Hồ sơ\s+/, '').split(' · ')[0].trim();
    return (window.KTT_CUSTOMS_DATA || []).find(row => row.code === code) || null;
  }
  async function request(action, id, record = {}) {
    const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, record }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Không thể lưu thay đổi.');
    return payload;
  }
  function field(row, name) {
    // The locked UI uses `data-field`; accept the alternate names too so that
    // product rows created by earlier versions can still be sent correctly.
    const aliases = {
      description: ['description', 'product', 'name'],
      packs: ['packs', 'packageCount'],
      productsPerPack: ['productsPerPack', 'products', 'productCount'],
      size: ['size', 'productSize'],
      qty: ['qty', 'declarationQuantity'],
      unit: ['unit', 'declarationUnit'],
      invoicePrice: ['invoicePrice', 'invoicePriceBeforeVat', 'price'],
      note: ['note', 'remark']
    };
    for (const key of aliases[name] || [name]) {
      const input = row.querySelector(`[data-field="${key}"], [data-sale-field="${key}"]`);
      if (input) return input.value?.trim() || '';
    }
    return '';
  }
  function saleLines(form) {
    return [...form.querySelectorAll('[data-line], [data-sale-row], .cf-product-row, .cf-sale-row')].map((row, index) => ({
      id: row.dataset.line || row.dataset.saleRow || `sale-${index}`, description: field(row, 'description'), packageCount: field(row, 'packs'),
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
  function disablePane(selector, disabled) {
    document.querySelector(selector)?.querySelectorAll('input, textarea, select, button:not(.ktt-change)').forEach(item => {
      item.disabled = disabled;
      item.setAttribute('aria-disabled', String(disabled));
    });
  }
  // Kim Thành Tín quản lý từng mã hàng độc lập, không sử dụng khái niệm lô.
  // The locked customs UI still retains `lot` internally for backwards
  // compatibility with old records, so only its presentation is suppressed.
  function removeLotPresentation() {
    const lotFilter = document.querySelector('#cf-lot-filter');
    if (lotFilter) {
      lotFilter.value = '';
      lotFilter.style.display = 'none';
      lotFilter.setAttribute('aria-hidden', 'true');
      lotFilter.tabIndex = -1;
    }

    document.querySelectorAll('th').forEach(header => {
      if (header.textContent.trim().toUpperCase() === 'MÃ HÀNG / LÔ') header.textContent = 'MÃ HÀNG';
    });

    // The old UI rendered LO-xxxx below each code.  A code is now the sole
    // tracking identifier, so remove only those directly associated sublines.
    document.querySelectorAll('.cf-code + .cf-sub').forEach(item => item.remove());

    document.querySelectorAll('label').forEach(label => {
      const labelText = [...label.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .join(' ');
      if (/^Lô hàng$/i.test(labelText)) label.remove();
    });

    document.querySelectorAll('.cf-export-footer span').forEach(item => {
      item.textContent = item.textContent.replace(/^Lô hàng:[^·]*·\s*/i, '');
    });
  }
  const confirmationColumns = [
    ['Mã hàng', row => row.code],
    ['STT', (_, index) => String(index + 1)],
    ['Mô tả hàng hóa', row => row.vi],
    ['Giá XHĐ trước thuế', row => row.invoicePrice],
    ['Mã HS', row => row.hs],
    ['SL1', row => row.qty1],
    ['ĐVT', row => row.unit1],
    ['Giá khai (USD)', row => row.price],
    ['Tổng USD', row => row.amount],
    ['Thuế NK (%)', row => row.importRate],
    ['Thuế NK', row => row.importTax],
    ['VAT (%)', row => row.vatRate],
    ['Tổng thuế (VNĐ)', row => row.totalTax]
  ];
  const displayValue = value => {
    if (value === undefined || value === null || value === '') return '';
    const number = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(number) && String(value).trim() !== ''
      ? number.toLocaleString('en-US', { maximumFractionDigits: 4 })
      : String(value);
  };
  function confirmationRows(shipment) {
    return (shipment?.customsLines || []).map((line, index) => ({ ...line, code: shipment.code, index }));
  }
  // The handoff template contains extra internal customs fields.  Customers
  // receive this concise confirmation sheet, which is also the export source.
  function syncConfirmationPresentation() {
    const sheet = document.querySelector('#cf-confirm-export');
    const shipment = selectedShipment();
    if (!sheet || !shipment) return;
    const rows = confirmationRows(shipment);
    const head = confirmationColumns.map(([label]) => `<th>${esc(label)}</th>`).join('');
    const body = rows.length
      ? rows.map((row, index) => `<tr>${confirmationColumns.map(([, get]) => `<td>${esc(displayValue(get(row, index)))}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${confirmationColumns.length}" style="text-align:center">Chưa có dòng khai báo</td></tr>`;
    sheet.innerHTML = `
      <div class="cf-export-title">THÔNG TIN KHAI BÁO HÀNG HÓA</div>
      <div class="cf-export-meta">Mã khách: ${esc(shipment.customer || '')} · Mã hàng: ${esc(shipment.code || '')}</div>
      <div style="overflow:auto"><table class="cf-confirm-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      <div class="cf-export-footer"><span>${rows.length} dòng khai báo</span><span>Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}</span></div>`;
  }
  function wrappedLines(context, value, width, maxLines = 5) {
    const words = String(value || '—').split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width > width && line) { lines.push(line); line = word; }
      else line = next;
      if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] += '…';
    return lines;
  }
  function downloadConfirmationPng(button) {
    const shipment = selectedShipment();
    const rows = confirmationRows(shipment);
    if (!shipment || !rows.length) throw new Error('Chưa có dữ liệu khai báo để tải ảnh.');
    const widths = [135, 52, 280, 130, 105, 62, 68, 125, 115, 98, 120, 78, 150];
    const sheetWidth = widths.reduce((sum, value) => sum + value, 0);
    const scale = 2, padding = 32, titleHeight = 88, headerHeight = 62, lineHeight = 24;
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = '16px Arial';
    const layout = rows.map((row, index) => {
      const values = confirmationColumns.map(([, get]) => displayValue(get(row, index)));
      const height = Math.max(54, ...values.map((value, col) => wrappedLines(measure, value, widths[col] - 18).length * lineHeight + 24));
      return { values, height };
    });
    const tableHeight = headerHeight + layout.reduce((sum, row) => sum + row.height, 0);
    const outputWidth = sheetWidth + padding * 2;
    const outputHeight = titleHeight + tableHeight + 78;
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth * scale; canvas.height = outputHeight * scale;
    const context = canvas.getContext('2d'); context.scale(scale, scale);
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, outputWidth, outputHeight);
    context.fillStyle = '#172033'; context.font = '700 25px Arial';
    context.fillText('THÔNG TIN KHAI BÁO HÀNG HÓA', padding, 36);
    context.font = '16px Arial'; context.fillStyle = '#45546f';
    context.fillText(`Mã khách: ${shipment.customer || '—'}   ·   Mã hàng: ${shipment.code || '—'}`, padding, 64);
    let x = padding, y = titleHeight;
    context.fillStyle = '#ddd1f5'; context.fillRect(x, y, sheetWidth, headerHeight);
    context.strokeStyle = '#b9afd5'; context.lineWidth = 1;
    confirmationColumns.forEach(([label], col) => {
      context.strokeRect(x, y, widths[col], headerHeight);
      context.fillStyle = '#30294a'; context.font = '700 14px Arial';
      wrappedLines(context, label, widths[col] - 16, 3).forEach((line, position) => context.fillText(line, x + 8, y + 24 + position * 18));
      x += widths[col];
    });
    y += headerHeight;
    layout.forEach((row, rowIndex) => {
      x = padding;
      context.fillStyle = rowIndex % 2 ? '#fbfaf7' : '#ffffff'; context.fillRect(x, y, sheetWidth, row.height);
      row.values.forEach((value, col) => {
        context.strokeStyle = '#d9dfeb'; context.strokeRect(x, y, widths[col], row.height);
        context.fillStyle = '#1d2636'; context.font = '15px Arial';
        wrappedLines(context, value, widths[col] - 18).forEach((line, position) => context.fillText(line, x + 9, y + 23 + position * lineHeight));
        x += widths[col];
      });
      y += row.height;
    });
    context.fillStyle = '#65738c'; context.font = '14px Arial';
    context.fillText(`${rows.length} dòng khai báo · Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`, padding, outputHeight - 28);
    const original = button.textContent;
    button.disabled = true; button.textContent = 'Đang tải ảnh…';
    canvas.toBlob(blob => {
      if (!blob) { button.disabled = false; button.textContent = original; alert('Không thể tạo ảnh PNG.'); return; }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob); link.download = `xac-nhan-khai-bao-${shipment.code || 'hang-hoa'}.png`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      button.disabled = false; button.textContent = '✓ Đã tải ảnh PNG';
    }, 'image/png');
  }
  function applyRoleUi() {
    const userBox = document.querySelector('.cf-user');
    const sessionKey = currentUser ? `${currentUser.id}:${currentUser.name}:${currentUser.role}` : '';
    if (userBox && currentUser && userBox.dataset.kttSessionUser !== sessionKey) {
      userBox.innerHTML = `<span>${esc(currentUser.name)} · ${esc(roleTitle(currentUser))}</span><button id="cf-logout" class="cf-avatar" title="Đăng xuất">${esc(initials(currentUser.name))}</button>`;
      userBox.dataset.kttSessionUser = sessionKey;
      userBox.querySelector('#cf-logout')?.addEventListener('click', () => window.top.postMessage({ type: 'ktt-customs-logout' }, '*'));
    }

    // All permitted users can see every workflow tab and every status.  Editing
    // is limited by role; the API repeats the same checks on the server.
    if (!allowSale()) {
      disablePane('#cf-pane-sale', true);
    } else {
      disablePane('#cf-pane-sale', selectedShipment()?._status !== 'sale_required');
    }
    if (!allowCustoms()) {
      disablePane('#cf-pane-customs', true);
      disablePane('#cf-pane-confirm', true);
    } else {
      disablePane('#cf-pane-customs', selectedShipment()?._status !== 'customs_pending');
      disablePane('#cf-pane-confirm', selectedShipment()?._status !== 'customer_confirmation');
    }
    // Kế toán is shown for context to every role, but remains read-only outside
    // the administrator/accounting workflow.
    disablePane('#cf-pane-accounting', currentUser?.role !== 'admin');
    removeLotPresentation();
    installWorkflowControls();
  }
  function workflowButton(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `cf-action ${className || ''}`; button.textContent = label;
    button.addEventListener('click', onClick); return button;
  }
  function installWorkflowControls() {
    const shipment = selectedShipment();
    if (!shipment) return;
    const saleForm = document.querySelector('#cf-sale-form');
    const customsForm = document.querySelector('#cf-customs-form');
    const addControls = (form, stage) => {
      if (!form || form.dataset.kttServerControls === '1') return;
      form.dataset.kttServerControls = '1';
      const feet = form.querySelectorAll('.cf-form-foot');
      const foot = feet[feet.length - 1];
      const finalButton = foot?.querySelector('button:not([type="button"]), button[type="submit"]') || [...(foot?.querySelectorAll('button') || [])].pop();
      if (!foot || !finalButton) return;
      finalButton.type = 'submit';
      finalButton.textContent = stage === 'sale' ? 'Lưu và gửi bộ phận khai báo' : 'Lưu và báo Khai báo xác nhận';
      const canEdit = stage === 'sale' ? allowSale() && shipment._status === 'sale_required' : allowCustoms() && shipment._status === 'customs_pending';
      if (canEdit) {
        const draft = workflowButton('Lưu nháp', 'ktt-draft', () => saveWorkflowForm(form, true));
        foot.insertBefore(draft, finalButton);
      } else {
        const locked = document.createElement('span'); locked.className = 'ktt-server-lock'; locked.textContent = 'Đã khóa sau khi gửi chính thức'; foot.insertBefore(locked, finalButton);
        finalButton.disabled = true;
        const canRequest = allowCustoms() && ((stage === 'sale' && ['customs_pending', 'customer_confirmation'].includes(shipment._status)) || (stage === 'customs' && ['customer_confirmation', 'ready_for_loading'].includes(shipment._status)));
        if (canRequest) foot.insertBefore(workflowButton('Yêu cầu sửa đổi', 'ktt-change', () => requestChange(stage)), finalButton);
      }
    };
    addControls(saleForm, 'sale'); addControls(customsForm, 'customs');
  }
  async function requestChange(stage) {
    const shipment = selectedShipment();
    const reason = window.prompt('Ghi rõ lý do cần sửa đổi:');
    if (!shipment || !reason?.trim()) return;
    try {
      await request('request_change', shipment._id, { stage, reason: reason.trim() });
      await refresh(); document.querySelector('.cf-close-detail')?.click();
      alert('Đã ghi lịch sử và trả đúng bước để chỉnh sửa.');
    } catch (error) { alert(error.message || 'Không thể tạo yêu cầu sửa đổi.'); }
  }
  async function refresh() {
    const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Không thể tải dữ liệu phân quyền.');
    currentUser = payload.user;
    const data = window.KTT_CUSTOMS_DATA;
    if (!Array.isArray(data)) return setTimeout(refresh, 60);
    data.splice(0, data.length, ...(payload.rows || []).map(mapRow));
    if (window.KTT_CUSTOMS_RENDER) window.KTT_CUSTOMS_RENDER();
    applyRoleUi();
    syncConfirmationPresentation();
  }
  async function saveWorkflowForm(form, draft = false) {
    if (!form || form.dataset.kttSaving === '1') return;
    form.dataset.kttSaving = '1';
    const submitButton = form.querySelector('.cf-form-foot button:not([type="button"]), .cf-form-foot button[type="submit"]');
    const originalLabel = submitButton?.textContent;
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Đang lưu…'; }
    const shipment = selectedShipment();
    try {
      if (!shipment) throw new Error('Không xác định được mã hàng đang xử lý.');
      if (form.id === 'cf-sale-form') {
        if (!allowSale()) throw new Error('Bạn không có quyền cập nhật Thông tin Sale.');
        const lines = saleLines(form); if (!lines.length) throw new Error('Cần có ít nhất một dòng sản phẩm có mô tả.');
        await request(draft ? 'save_sale_draft' : 'save_sale', shipment._id, { productLines: lines });
      } else {
        if (!allowCustoms()) throw new Error('Chỉ bộ phận Khai báo HQ được lên list.');
        const lines = customsLines(form); if (!lines.length) throw new Error('Cần có ít nhất một dòng khai báo.');
        await request(draft ? 'save_customs_draft' : 'save_customs', shipment._id, { customsLines: lines });
      }
      await refresh(); document.querySelector('.cf-close-detail')?.click();
      alert(draft ? 'Đã lưu nháp. Trạng thái luồng không thay đổi.' : 'Đã lưu chính thức và khóa phần dữ liệu vừa gửi.');
    } catch (error) { alert(error.message || 'Không thể lưu thay đổi.'); }
    finally {
      form.dataset.kttSaving = '';
      if (submitButton) { submitButton.disabled = false; submitButton.textContent = originalLabel || 'Lưu'; }
    }
  }
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.id !== 'cf-sale-form' && form.id !== 'cf-customs-form') return;
    event.preventDefault(); event.stopImmediatePropagation();
    saveWorkflowForm(form);
  }, true);
  // The original handoff attaches its own form handler.  Intercept the actual
  // save-button click as well, preventing that demo-only handler from
  // swallowing the action before the real API call is made.
  document.addEventListener('click', event => {
    const button = event.target.closest('#cf-sale-form .cf-form-foot button, #cf-customs-form .cf-form-foot button');
    if (!button) return;
    const form = button.closest('form');
    if (!form || button.type === 'button') return;
    event.preventDefault(); event.stopImmediatePropagation();
    saveWorkflowForm(form);
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
  // The locked module's original export relies on a library that is not part
  // of the deployed page.  Generate the confirmation image directly from the
  // actual declaration data, then trigger a real browser download.
  document.addEventListener('click', event => {
    const button = event.target.closest('#cf-export-png');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try { downloadConfirmationPng(button); }
    catch (error) { alert(error.message || 'Không thể tạo ảnh PNG.'); }
  }, true);
  // The locked UI builds detail forms after a row or tab is clicked.  Reapply
  // read-only state after that render without observing DOM mutations.
  document.addEventListener('click', () => setTimeout(() => {
    applyRoleUi();
    syncConfirmationPresentation();
  }, 0), true);
  function refreshWhenIdle() {
    const active = document.activeElement;
    const editing = active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
    if (document.hidden || editing) return;
    refresh().catch(error => console.warn('KTT customs live sync:', error));
  }
  window.addEventListener('focus', refreshWhenIdle);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshWhenIdle(); });
  window.setInterval(refreshWhenIdle, 5000);
  const readabilityStyle = document.createElement('style');
  readabilityStyle.textContent = `
    #customs-flow-app .cf-table table{font-size:14px!important}#customs-flow-app .cf-table th,#customs-flow-app .cf-table td{padding:14px 12px!important}
    #customs-flow-app .cf-code{font-size:15px!important}#customs-flow-app .cf-sub,#customs-flow-app .cf-status{font-size:12px!important}
    #customs-flow-app .cf-dialog{width:min(1180px,96vw)!important}#customs-flow-app .cf-dialog-body,#customs-flow-app .cf-dialog-head{font-size:15px!important}
    #customs-flow-app .cf-work-tab,#customs-flow-app label,#customs-flow-app label input,#customs-flow-app label select,#customs-flow-app textarea{font-size:14px!important}
    #customs-flow-app .cf-line-table{font-size:13px!important}#customs-flow-app .cf-line-table input,#customs-flow-app .cf-line-table select,#customs-flow-app .cf-line-table textarea{font-size:13px!important}
    .ktt-server-lock{display:inline-flex;align-items:center;padding:9px 11px;border-radius:8px;background:#eaf8ef;color:#16835a;font-weight:700}.ktt-draft,.ktt-change{border-color:#ef7a2a!important;color:#d85d12!important;background:#fff!important}
  `;
  document.head.appendChild(readabilityStyle);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.cf-modal.open').forEach(modal => modal.classList.remove('open'));
  });
  refresh().catch(error => console.error('KTT customs session bridge:', error));
})();
