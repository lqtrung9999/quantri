(() => {
  'use strict';
  const root = document.getElementById('customs-flow-app'), main = root?.querySelector('.cf-main'), original = root?.querySelector('.cf-content');
  if (!root || !main || !original) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const num = value => Number(String(value ?? '').replace(/[,\s]/g, '')) || 0;
  const fmt = (value, digits = 3) => num(value).toLocaleString('en-US', { maximumFractionDigits: digits });
  const sourceRows = () => Array.isArray(window.KTT_CUSTOMS_DATA) ? window.KTT_CUSTOMS_DATA : [];
  const eligible = row => ['ready_for_loading', 'loaded'].includes(row._status) && Array.isArray(row.customsLines) && row.customsLines.length;
  const selected = new Set();

  const workspace = document.createElement('section');
  workspace.id = 'cf-documents-workspace'; workspace.hidden = true;
  workspace.innerHTML = `<div class="cd-head"><div><h1>Chứng Từ HQ</h1><p>Danh sách đã xác nhận với khách. Có thể kéo chọn ô như bảng tính hoặc sao chép các dòng đã chọn.</p></div><button class="cf-action cd-back">← Khai báo &amp; xếp xe</button></div>
    <div class="cd-kpis"><article><span>MÃ ĐÃ XÁC NHẬN</span><b id="cd-code-count">0</b><small>Sẵn sàng hoặc đã xếp xe</small></article><article><span>DÒNG CHỨNG TỪ</span><b id="cd-line-count">0</b><small>Dòng khai báo có dữ liệu</small></article><article><span>ĐÃ CHỌN</span><b id="cd-selected-count">0</b><small>Dùng để sao chép</small></article></div>
    <div class="cd-toolbar"><label><input type="checkbox" id="cd-select-all"> Chọn tất cả đang hiển thị</label><input id="cd-search" placeholder="Tìm mã hàng, tên hàng, HS code, Sale..."><select id="cd-state"><option value="all">Tất cả đã xác nhận</option><option value="ready">Chưa xếp xe</option><option value="loaded">Đã xếp xe</option></select><button class="cf-action" id="cd-refresh">↻ Cập nhật</button></div>
    <div class="cd-actions"><span>Chọn ô trực tiếp để copy, hoặc dùng các nút bên phải.</span><button class="cf-action" id="cd-copy-visible">Sao chép đang hiển thị</button><button class="cf-action primary" id="cd-copy-selected">Sao chép dòng đã chọn</button></div>
    <div class="cd-sheet" tabindex="0"><table><thead><tr><th class="cd-check">Chọn</th><th>NVKD</th><th>STT</th><th>Mã hàng</th><th>Tên tiếng Anh</th><th>Mô tả hàng hóa</th><th>Giá XHĐ trước thuế</th><th>Mã HS</th><th>Số lượng khai báo</th><th>Đơn vị khai báo</th><th>Giá khai USD</th><th>Tổng USD</th><th>Thuế NK %</th><th>VAT %</th><th>Mã xe</th></tr></thead><tbody id="cd-body"></tbody></table></div>
    <section class="cd-export"><div><h2>Xuất file Excel khai ECUS theo xe</h2><p>File xuất giữ nguyên các sheet, công thức và định dạng của mẫu đã cung cấp.</p></div><select id="cd-trip"><option value="">Chọn mã xe / chuyến bốc</option></select><button class="cf-action primary" id="cd-export" disabled>Xuất file Excel ECUS</button></section>`;
  main.appendChild(workspace);

  const declaredNav = [...root.querySelectorAll('.cf-nav button')].find(button => /Dữ liệu đã khai/i.test(button.textContent || ''));
  const nav = document.createElement('button');
  nav.id = 'cf-customs-documents-open';
  nav.innerHTML = '<span class="ico">▦</span><span>Chứng Từ HQ</span>';
  declaredNav?.insertAdjacentElement('afterend', nav);
  const navButtons = [...root.querySelectorAll('.cf-nav button')];
  const coordination = navButtons.find(button => /Khai báo\s*&\s*xếp xe/i.test(button.textContent || ''));

  function flattened() {
    const query = workspace.querySelector('#cd-search').value.trim().toLocaleLowerCase('vi-VN');
    const state = workspace.querySelector('#cd-state').value;
    const rows = [];
    sourceRows().filter(eligible).forEach(shipment => {
      if (state === 'ready' && shipment._status !== 'ready_for_loading') return;
      if (state === 'loaded' && shipment._status !== 'loaded') return;
      shipment.customsLines.forEach((line, index) => {
        const item = { id: `${shipment._id}:${line.id || index}`, shipment, line, index };
        const haystack = `${shipment.code} ${shipment.name} ${shipment.sale} ${shipment.team} ${line.en} ${line.vi} ${line.hs}`.toLocaleLowerCase('vi-VN');
        if (!query || haystack.includes(query)) rows.push(item);
      });
    });
    return rows;
  }
  function truckText(row) {
    return (row.loadingRecords || []).map(item => item.truckCode).filter(Boolean).join(', ') || '—';
  }
  function tableValues(item, index) {
    const { shipment, line } = item;
    return ['', '', index + 1, shipment.code, line.en, line.vi, fmt(line.invoicePrice, 2), line.hs, fmt(line.qty1, 3), line.unit1 || 'Cái', fmt(line.price, 3), fmt(line.amount, 3), fmt(line.importRate, 2), fmt(line.vatRate, 2), truckText(shipment)];
  }
  function trips() {
    const map = new Map();
    sourceRows().forEach(row => (row.loadingRecords || []).forEach(item => {
      if (!item.batchId) return;
      const current = map.get(item.batchId) || { ...item, count: 0, packages: 0, volume: 0 };
      current.count += 1; current.packages += num(item.packageCount); current.volume += num(item.volumeM3); map.set(item.batchId, current);
    }));
    return [...map.values()].sort((a, b) => `${b.loadingDate}${b.createdAt}`.localeCompare(`${a.loadingDate}${a.createdAt}`));
  }
  function renderTrips() {
    const select = workspace.querySelector('#cd-trip'), current = select.value;
    select.innerHTML = '<option value="">Chọn mã xe / chuyến bốc</option>' + trips().map(item => `<option value="${esc(item.batchId)}">${esc(item.truckCode)} · ${esc(item.loadingDate)} · ${item.count} mã · ${fmt(item.packages, 2)} kiện · ${fmt(item.volume, 2)} m³</option>`).join('');
    if ([...select.options].some(option => option.value === current)) select.value = current;
    workspace.querySelector('#cd-export').disabled = !select.value;
  }
  function render() {
    const list = flattened(), codeCount = new Set(list.map(item => item.shipment._id)).size;
    workspace.querySelector('#cd-code-count').textContent = codeCount;
    workspace.querySelector('#cd-line-count').textContent = list.length;
    workspace.querySelector('#cd-body').innerHTML = list.map((item, index) => {
      const values = tableValues(item, index);
      return `<tr data-row-id="${esc(item.id)}"><td class="cd-check"><input type="checkbox" data-select="${esc(item.id)}" ${selected.has(item.id) ? 'checked' : ''}></td>${values.slice(1).map((value, cell) => `<td class="${[3,4].includes(cell) ? 'cd-left' : ''}">${esc(value)}</td>`).join('')}</tr>`;
    }).join('') || '<tr><td colspan="15" class="cd-empty">Chưa có mã hàng đã được khách xác nhận.</td></tr>';
    workspace.querySelector('#cd-selected-count').textContent = [...selected].filter(id => list.some(item => item.id === id)).length;
    renderTrips();
  }
  function tsv(items) {
    const headers = ['NVKD','STT','Mã hàng','Tên TA','Mô tả hàng hóa','Giá XHĐ trước thuế','Mã HS','Số lượng khai báo','ĐVT','Giá khai USD','Tổng USD','Thuế NK %','VAT %','Mã xe'];
    const lines = items.map((item, index) => tableValues(item, index).slice(1).map(value => String(value).replace(/[\t\r\n]+/g, ' ')).join('\t'));
    return [headers.join('\t'), ...lines].join('\n');
  }
  async function copy(items) {
    if (!items.length) return alert('Chưa có dòng dữ liệu để sao chép.');
    try { await navigator.clipboard.writeText(tsv(items)); alert(`Đã sao chép ${items.length} dòng chứng từ.`); }
    catch { alert('Trình duyệt chưa cho phép sao chép tự động. Anh/chị có thể kéo chọn trực tiếp trên bảng rồi nhấn Ctrl/Cmd + C.'); }
  }
  function openWorkspace() {
    original.hidden = true;
    document.querySelector('#cf-processing-workspace')?.setAttribute('hidden', '');
    document.querySelector('#cf-truck-workspace')?.setAttribute('hidden', '');
    workspace.hidden = false; navButtons.forEach(button => button.classList.remove('active')); nav?.classList.add('active'); render();
  }
  function closeWorkspace() { workspace.hidden = true; original.hidden = false; navButtons.forEach(button => button.classList.remove('active')); coordination?.classList.add('active'); }
  nav?.addEventListener('click', openWorkspace); workspace.querySelector('.cd-back').addEventListener('click', closeWorkspace);
  navButtons.filter(button => button !== nav).forEach(button => button.addEventListener('click', () => { workspace.hidden = true; }));
  workspace.querySelector('#cd-search').addEventListener('input', render); workspace.querySelector('#cd-state').addEventListener('change', render);
  workspace.querySelector('#cd-refresh').addEventListener('click', async () => { await window.KTT_CUSTOMS_REFRESH?.(); render(); });
  workspace.querySelector('#cd-select-all').addEventListener('change', event => { flattened().forEach(item => event.target.checked ? selected.add(item.id) : selected.delete(item.id)); render(); });
  workspace.querySelector('#cd-copy-visible').addEventListener('click', () => copy(flattened()));
  workspace.querySelector('#cd-copy-selected').addEventListener('click', () => copy(flattened().filter(item => selected.has(item.id))));
  workspace.querySelector('#cd-trip').addEventListener('change', event => { workspace.querySelector('#cd-export').disabled = !event.target.value; });
  workspace.querySelector('#cd-export').addEventListener('click', async () => {
    const batchId = workspace.querySelector('#cd-trip').value; if (!batchId) return;
    const button = workspace.querySelector('#cd-export'); button.disabled = true; button.textContent = 'Đang tạo file...';
    try {
      const response = await fetch(`/api/customs-documents/export?batchId=${encodeURIComponent(batchId)}`, { credentials: 'same-origin' });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Không thể tạo file Excel.'); }
      const blob = await response.blob(), link = document.createElement('a');
      const disposition = response.headers.get('content-disposition') || '', matched = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      link.href = URL.createObjectURL(blob); link.download = matched ? decodeURIComponent(matched[1]) : 'Chung-tu-HQ.xlsx'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) { alert(error.message); }
    finally { button.disabled = !workspace.querySelector('#cd-trip').value; button.textContent = 'Xuất file Excel ECUS'; }
  });
  workspace.addEventListener('change', event => { const checkbox = event.target.closest('[data-select]'); if (!checkbox) return; checkbox.checked ? selected.add(checkbox.dataset.select) : selected.delete(checkbox.dataset.select); workspace.querySelector('#cd-selected-count').textContent = selected.size; });
  window.addEventListener('ktt-customs-refreshed', () => { if (!workspace.hidden) render(); });

  const style = document.createElement('style'); style.textContent = `
    #cf-documents-workspace{padding:18px;background:#f4f7fb;min-height:calc(100vh - 68px);color:#172033;font-size:12px}#cf-documents-workspace[hidden]{display:none!important}.cd-head,.cd-toolbar,.cd-actions,.cd-export{display:flex;align-items:center;justify-content:space-between;gap:12px}.cd-head h1{font-size:24px;margin:0}.cd-head p{margin:4px 0 0;color:#69778d}.cd-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}.cd-kpis article{min-height:100px;border:1px solid #dce4ef;border-radius:12px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.cd-kpis span{font-weight:850;color:#61718a}.cd-kpis b{font-size:25px;margin:5px 0}.cd-kpis small{color:#7a8799}.cd-toolbar{padding:11px;border:1px solid #dce4ef;border-radius:11px;background:#fff}.cd-toolbar label{font-weight:750;white-space:nowrap}.cd-toolbar>input{flex:1;height:36px;padding:0 12px;border:1px solid #cad6e5;border-radius:8px}.cd-toolbar select,.cd-export select{height:36px;padding:0 10px;border:1px solid #cad6e5;border-radius:8px;background:#fff}.cd-actions{padding:10px 0}.cd-actions span{margin-right:auto;color:#68768b}.cd-sheet{overflow:auto;max-height:58vh;border:1px solid #cfd9e7;border-radius:10px;background:#fff;user-select:text}.cd-sheet table{border-collapse:separate;border-spacing:0;min-width:2200px;width:100%;font-family:Arial,sans-serif}.cd-sheet th{position:sticky;top:0;z-index:3;background:#eadfff;color:#473b63;padding:12px 10px;border-right:1px solid #cfc5e0;border-bottom:1px solid #cfc5e0;text-align:center;vertical-align:middle;white-space:nowrap}.cd-sheet td{height:52px;padding:8px 10px;border-right:1px solid #dde3ec;border-bottom:1px solid #dde3ec;text-align:center;vertical-align:middle;background:#fff}.cd-sheet tr:nth-child(even) td{background:#fbfcfe}.cd-sheet .cd-left{text-align:left;white-space:normal;min-width:260px}.cd-sheet th:nth-child(6),.cd-sheet td:nth-child(6){min-width:520px}.cd-sheet th:nth-child(5),.cd-sheet td:nth-child(5){min-width:230px}.cd-check{position:sticky!important;left:0;z-index:4!important;min-width:54px!important}.cd-sheet td.cd-check{background:#f7f9fc!important;z-index:2!important}.cd-empty{padding:34px!important;color:#728096}.cd-export{margin-top:14px;padding:15px;border:1px solid #dce4ef;border-radius:11px;background:#fff}.cd-export h2{margin:0;font-size:17px}.cd-export p{margin:4px 0 0;color:#6c7990}.cd-export select{min-width:390px}@media(max-width:900px){.cd-kpis{grid-template-columns:1fr}.cd-toolbar,.cd-actions,.cd-export{align-items:stretch;flex-direction:column}.cd-export select{min-width:0;width:100%}}
  `; document.head.appendChild(style); render();
})();
