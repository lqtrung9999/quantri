(() => {
  const normalize = value => String(value || '').trim().toLocaleUpperCase('vi-VN');
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
  schedule();
})();
