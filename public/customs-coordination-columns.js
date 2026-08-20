(() => {
  const normalize = value => String(value || '').trim().toLocaleUpperCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D');
  let cache = new Map(), scheduled = false;

  function decorate() {
    const header = document.querySelector('.table-wrap thead tr');
    if (header && !header.dataset.operationalColumns) {
      const dateHeader = document.createElement('th');
      dateHeader.textContent = 'NGÀY/THÁNG';
      header.prepend(dateHeader);
      const saleHeader = [...header.children].find(cell => normalize(cell.textContent) === 'SALE');
      if (saleHeader) {
        const accountantHeader = document.createElement('th');
        accountantHeader.className = 'sale';
        accountantHeader.textContent = 'KẾ TOÁN';
        saleHeader.after(accountantHeader);
      }
      header.dataset.operationalColumns = 'true';
    }
    const cargoHeader = [...(header?.children || [])].find(cell => normalize(cell.textContent).includes('MAHANG'));
    if (cargoHeader) cargoHeader.textContent = 'MÃ HÀNG';
    document.querySelectorAll('#rows tr').forEach(row => {
      if (row.dataset.operationalColumns || row.querySelector('.empty')) return;
      const code = row.querySelector('[data-open]')?.textContent;
      const source = cache.get(normalize(code));
      if (!source) return;
      const date = document.createElement('td');
      date.textContent = source.operationDate || '—';
      row.prepend(date);
      const saleCell = row.children[5];
      if (saleCell) {
        const accountant = document.createElement('td');
        accountant.textContent = source.accountant || '—';
        saleCell.after(accountant);
      }
      row.dataset.operationalColumns = 'true';
    });
    document.querySelectorAll('[data-open] + .sub').forEach(item => { item.hidden = true; });
    document.querySelectorAll('label').forEach(label => {
      const ownText = [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(' ');
      if (normalize(ownText) === 'LOHANG') label.remove();
    });
    decorateDetail();
  }

  function decorateDetail() {
    const modal = document.querySelector('#detailModal');
    if (!modal?.classList.contains('open')) return;
    const title = document.querySelector('#detailTitle');
    const cargoCode = String(title?.textContent || '').split('·').at(-1).trim();
    const row = cache.get(normalize(cargoCode));
    if (!row) return;
    title.textContent = `Hồ sơ ${row.cargoCode}${row.productName ? ` · ${row.productName}` : ''}`;
    let meta = modal.querySelector('#shipmentMeta');
    if (!meta) {
      meta = document.createElement('section');
      meta.id = 'shipmentMeta';
      modal.querySelector('.tabs')?.before(meta);
    }
    if (meta.dataset.cargo !== row.cargoCode) {
      meta.innerHTML = [
        ['Mã khách', row.customerCode || '—'],
        ['Số kiện', Number(row.packageCount || 0).toLocaleString('vi-VN')],
        ['Khối lượng', `${Number(row.weightKg || 0).toLocaleString('vi-VN')} kg`],
        ['Thể tích', `${Number(row.volumeM3 || 0).toLocaleString('vi-VN')} m³`],
        ['Sale', row.saleOwner || 'Chưa phân công'],
        ['Kế toán', row.accountant || '—']
      ].map(([label, value]) => `<div class="shipment-meta-card"><span>${label}</span><b>${value}</b></div>`).join('');
      meta.dataset.cargo = row.cargoCode;
    }
    const warehouseFields = modal.querySelector('#pane-warehouse .fields');
    if (warehouseFields) {
      warehouseFields.querySelectorAll('label').forEach(label => {
        const ownText = [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(' ');
        if (normalize(ownText) === 'LOHANG') label.remove();
      });
      if (!warehouseFields.querySelector('.accountant-detail-field')) {
        const accountantField = document.createElement('label');
        accountantField.className = 'accountant-detail-field';
        accountantField.innerHTML = `Kế toán<input value="${row.accountant || '—'}" readonly>`;
        warehouseFields.append(accountantField);
      }
    }
    const stages = { sale_required: 1, customs_pending: 2, customer_confirmation: 3, ready_for_loading: 4 };
    const current = stages[row.status] ?? 0;
    modal.querySelectorAll('#workflow .step').forEach((step, index) => step.classList.toggle('current', index === current));
  }

  async function sync() {
    try {
      const response = await fetch('/api/customs-coordination');
      const data = await response.json();
      if (!response.ok) return;
      cache = new Map((data.rows || []).map(row => [normalize(row.cargoCode), row]));
      decorate();
    } catch { /* Existing page error handling remains in charge. */ }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; sync(); });
  }
  new MutationObserver(schedule).observe(document.querySelector('#rows'), { childList: true });
  new MutationObserver(() => requestAnimationFrame(decorate)).observe(document.querySelector('#detailModal'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  schedule();
})();
