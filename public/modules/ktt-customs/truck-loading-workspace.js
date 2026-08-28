(() => {
  'use strict';
  const root = document.getElementById('customs-flow-app'), main = root?.querySelector('.cf-main'), original = root?.querySelector('.cf-content');
  if (!root || !main || !original) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const num = value => Number(String(value ?? '').replace(/[,\s]/g, '')) || 0;
  const fmt = value => num(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const rows = () => Array.isArray(window.KTT_CUSTOMS_DATA) ? window.KTT_CUSTOMS_DATA : [];
  const loadedPacks = row => (row.loadingRecords || []).reduce((sum, item) => sum + num(item.packageCount), 0);
  const loadedM3 = row => (row.loadingRecords || []).reduce((sum, item) => sum + num(item.volumeM3), 0);
  const remainPacks = row => Math.max(0, num(row.packs) - loadedPacks(row));
  const remainM3 = row => Math.max(0, num(row.m3) - loadedM3(row));
  const canEdit = () => ['admin', 'truck_planner'].includes(window.KTT_CUSTOMS_SESSION?.user?.role);

  const workspace = document.createElement('section');
  workspace.id = 'cf-truck-workspace'; workspace.hidden = true;
  workspace.innerHTML = `<div class="tl-head"><div><h1>Xếp Xe CN</h1><p>Quản lý hàng sẵn sàng, lập danh sách bốc xe và theo dõi lượng hàng còn lại.</p></div><button class="cf-action tl-back">← Khai báo &amp; xếp xe</button></div>
    <div class="tl-kpis"><article><span>MÃ CHỜ XẾP</span><b id="tl-ready-count">0</b><small>Đang còn hàng</small></article><article><span>KIỆN CHỜ XẾP</span><b id="tl-ready-packs">0</b><small>Tổng số kiện còn lại</small></article><article><span>KHỐI CHỜ XẾP</span><b id="tl-ready-volume">0 m³</b><small>Căn gọi xe Trung Quốc</small></article><article><span>ĐANG XẾP MỘT PHẦN</span><b id="tl-partial-count">0</b><small>Còn hàng cho chuyến sau</small></article></div>
    <div class="tl-toolbar"><label class="tl-check-all"><input type="checkbox" id="tl-select-all"> Chọn tất cả đang hiển thị</label><input id="tl-search" placeholder="Tìm mã hàng, mã khách, tên hàng, Sale..."><select id="tl-view"><option value="ready">Hàng đang chờ xếp</option><option value="history">Lịch sử đã bốc xe</option><option value="all">Tất cả</option></select><button class="cf-action" id="tl-refresh">↻ Cập nhật</button></div>
    <div class="tl-selection"><span>Đã chọn <b id="tl-selected-count">0</b> mã · <b id="tl-selected-packs">0</b> kiện · <b id="tl-selected-volume">0 m³</b></span><button class="cf-action primary" id="tl-open-plan">Tạo danh sách xếp xe</button></div>
    <div class="tl-table-wrap"><table><thead><tr><th>Chọn</th><th>Mã hàng</th><th>Tên hàng</th><th>Mã KH / Chủ hàng</th><th>Sale / Phòng</th><th>Ngày kho</th><th>Tổng kiện</th><th>Tổng m³</th><th>Còn kiện</th><th>Còn m³</th><th>Trạng thái</th><th>Xe đã bốc</th></tr></thead><tbody id="tl-body"></tbody></table></div>
    <section class="tl-plan" hidden><div class="tl-plan-head"><div><h2>Lập danh sách bốc xe</h2><p>Điều chỉnh số kiện và m³ thực tế nếu chỉ xếp một phần.</p></div><button class="tl-plan-close" aria-label="Đóng">×</button></div><div class="tl-plan-meta"><label>Mã xe / biển xe<input id="tl-truck-code" placeholder="VD: CN068"></label><label>Ngày bốc xe<input id="tl-loading-date" type="date"></label><label>Ghi chú chung<input id="tl-note" placeholder="Thông tin tài xế, cửa kho..."></label></div><div class="tl-plan-rows"></div><div class="tl-plan-foot"><span id="tl-plan-total"></span><button class="cf-action tl-plan-cancel">Hủy</button><button class="cf-action primary" id="tl-save-plan">Xác nhận đã bốc xe</button></div></section>`;
  main.appendChild(workspace);
  const navButtons = [...root.querySelectorAll('.cf-nav button')];
  const nav = navButtons.find(button => /Báo cáo vận hành/i.test(button.textContent || ''));
  const coordination = navButtons.find(button => /Khai báo\s*&\s*xếp xe/i.test(button.textContent || ''));
  if (nav) nav.innerHTML = '<span class="ico">◫</span><span>Xếp Xe CN</span>';
  const selected = new Set();

  function visible() {
    const query = workspace.querySelector('#tl-search').value.trim().toLocaleLowerCase('vi-VN'), view = workspace.querySelector('#tl-view').value;
    return rows().filter(row => {
      const hasLoading = (row.loadingRecords || []).length > 0, hasRemaining = row._status === 'ready_for_loading' && (remainPacks(row) > 0 || remainM3(row) > 0);
      if (view === 'ready' && !hasRemaining) return false;
      if (view === 'history' && !hasLoading) return false;
      return !query || `${row.code} ${row.name} ${row.customer} ${row.owner} ${row.sale} ${row.team}`.toLocaleLowerCase('vi-VN').includes(query);
    });
  }
  function loadingBadges(row) {
    if (!(row.loadingRecords || []).length) return '—';
    return row.loadingRecords.map(entry => `<div class="tl-trip"><b>${esc(entry.truckCode)}</b><span>${esc(entry.loadingDate)} · ${fmt(entry.packageCount)} kiện · ${fmt(entry.volumeM3)} m³</span>${canEdit() ? `<button data-revert="${esc(entry.id)}" data-id="${esc(row._id)}" title="Trả lần bốc này về chờ xếp">Hoàn tác</button>` : ''}</div>`).join('');
  }
  function render() {
    const ready = rows().filter(row => row._status === 'ready_for_loading' && (remainPacks(row) > 0 || remainM3(row) > 0));
    workspace.querySelector('#tl-ready-count').textContent = ready.length;
    workspace.querySelector('#tl-ready-packs').textContent = fmt(ready.reduce((sum, row) => sum + remainPacks(row), 0));
    workspace.querySelector('#tl-ready-volume').textContent = `${fmt(ready.reduce((sum, row) => sum + remainM3(row), 0))} m³`;
    workspace.querySelector('#tl-partial-count').textContent = ready.filter(row => loadedPacks(row) > 0 || loadedM3(row) > 0).length;
    const list = visible();
    workspace.querySelector('#tl-body').innerHTML = list.map(row => { const remaining = row._status === 'ready_for_loading' && (remainPacks(row) > 0 || remainM3(row) > 0), partial = remaining && (loadedPacks(row) > 0 || loadedM3(row) > 0); return `<tr><td><input type="checkbox" data-select="${esc(row._id)}" ${selected.has(row._id) ? 'checked' : ''} ${!remaining || !canEdit() ? 'disabled' : ''}></td><td><b>${esc(row.code)}</b></td><td class="tl-left">${esc(row.name || '—')}</td><td class="tl-left"><b>${esc(row.customer || '—')}</b><small>${esc(row.owner || '—')}</small></td><td class="tl-left">${esc(row.sale || '—')}<small>${esc(row.team || '—')}</small></td><td>${esc(row.operationDate || '—')}</td><td>${fmt(row.packs)}</td><td>${fmt(row.m3)}</td><td><b>${fmt(remainPacks(row))}</b></td><td><b>${fmt(remainM3(row))}</b></td><td><span class="tl-status ${partial ? 'partial' : remaining ? 'ready' : 'loaded'}">${partial ? 'Xếp một phần' : remaining ? 'Chưa xếp xe' : 'Đã xếp hết'}</span></td><td class="tl-left">${loadingBadges(row)}</td></tr>`; }).join('') || '<tr><td colspan="12" class="tl-empty">Không có mã hàng phù hợp.</td></tr>';
    updateSelection();
  }
  function updateSelection() {
    const picked = rows().filter(row => selected.has(row._id) && row._status === 'ready_for_loading');
    workspace.querySelector('#tl-selected-count').textContent = picked.length;
    workspace.querySelector('#tl-selected-packs').textContent = fmt(picked.reduce((sum, row) => sum + remainPacks(row), 0));
    workspace.querySelector('#tl-selected-volume').textContent = `${fmt(picked.reduce((sum, row) => sum + remainM3(row), 0))} m³`;
    workspace.querySelector('#tl-open-plan').disabled = !picked.length || !canEdit();
  }
  function openPlan() {
    const picked = rows().filter(row => selected.has(row._id) && row._status === 'ready_for_loading'); if (!picked.length) return;
    workspace.querySelector('#tl-loading-date').value = today();
    workspace.querySelector('.tl-plan-rows').innerHTML = picked.map(row => `<div class="tl-plan-row" data-id="${esc(row._id)}"><div><b>${esc(row.code)}</b><small>Còn ${fmt(remainPacks(row))} kiện · ${fmt(remainM3(row))} m³</small></div><label>Số kiện bốc<input data-packs value="${remainPacks(row)}" inputmode="decimal"></label><label>Số m³ bốc<input data-m3 value="${remainM3(row)}" inputmode="decimal"></label><button data-remove-plan="${esc(row._id)}">Bỏ</button></div>`).join('');
    workspace.querySelector('.tl-plan').hidden = false; updatePlanTotal(); workspace.querySelector('#tl-truck-code').focus();
  }
  function updatePlanTotal() { const planRows = [...workspace.querySelectorAll('.tl-plan-row')]; workspace.querySelector('#tl-plan-total').textContent = `${planRows.length} mã · ${fmt(planRows.reduce((sum, row) => sum + num(row.querySelector('[data-packs]').value), 0))} kiện · ${fmt(planRows.reduce((sum, row) => sum + num(row.querySelector('[data-m3]').value), 0))} m³`; }
  function closePlan() { workspace.querySelector('.tl-plan').hidden = true; }
  async function post(body) { const response = await fetch('/api/customs-coordination', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Không thể cập nhật xếp xe.'); return payload; }
  async function savePlan() {
    const truckCode = workspace.querySelector('#tl-truck-code').value.trim(), loadingDate = workspace.querySelector('#tl-loading-date').value, planRows = [...workspace.querySelectorAll('.tl-plan-row')];
    if (!truckCode || !loadingDate || !planRows.length) return alert('Vui lòng nhập mã xe, ngày bốc và giữ ít nhất một mã hàng.');
    const assignments = planRows.map(row => ({ id: row.dataset.id, packageCount: num(row.querySelector('[data-packs]').value), volumeM3: num(row.querySelector('[data-m3]').value) }));
    try { workspace.querySelector('#tl-save-plan').disabled = true; await post({ action: 'assign_truck', id: assignments[0].id, record: { truckCode, loadingDate, note: workspace.querySelector('#tl-note').value, assignments } }); selected.clear(); closePlan(); await window.KTT_CUSTOMS_REFRESH?.(); render(); alert(`Đã ghi nhận ${assignments.length} mã hàng lên xe ${truckCode}.`); } catch (error) { alert(error.message); } finally { workspace.querySelector('#tl-save-plan').disabled = false; }
  }
  function openWorkspace() { original.hidden = true; document.querySelector('#cf-processing-workspace')?.setAttribute('hidden', ''); workspace.hidden = false; navButtons.forEach(button => button.classList.remove('active')); nav?.classList.add('active'); render(); }
  function closeWorkspace() { workspace.hidden = true; original.hidden = false; navButtons.forEach(button => button.classList.remove('active')); coordination?.classList.add('active'); }
  nav?.addEventListener('click', openWorkspace); workspace.querySelector('.tl-back').addEventListener('click', closeWorkspace);
  navButtons.filter(button => button !== nav).forEach(button => button.addEventListener('click', () => { workspace.hidden = true; }));
  workspace.querySelector('#tl-search').addEventListener('input', render); workspace.querySelector('#tl-view').addEventListener('change', render);
  workspace.querySelector('#tl-refresh').addEventListener('click', async () => { await window.KTT_CUSTOMS_REFRESH?.(); render(); });
  workspace.querySelector('#tl-select-all').addEventListener('change', event => { visible().filter(row => row._status === 'ready_for_loading').forEach(row => event.target.checked ? selected.add(row._id) : selected.delete(row._id)); render(); });
  workspace.querySelector('#tl-open-plan').addEventListener('click', openPlan); workspace.querySelector('.tl-plan-close').addEventListener('click', closePlan); workspace.querySelector('.tl-plan-cancel').addEventListener('click', closePlan); workspace.querySelector('#tl-save-plan').addEventListener('click', savePlan);
  workspace.addEventListener('input', event => { if (event.target.matches('[data-packs]')) { const row = event.target.closest('.tl-plan-row'), item = rows().find(entry => entry._id === row.dataset.id), packs = num(event.target.value); if (item && remainPacks(item) > 0) row.querySelector('[data-m3]').value = Math.min(remainM3(item), remainM3(item) * packs / remainPacks(item)).toFixed(2); updatePlanTotal(); } else if (event.target.matches('[data-m3]')) updatePlanTotal(); });
  workspace.addEventListener('click', async event => { const checkbox = event.target.closest('[data-select]'); if (checkbox) { checkbox.checked ? selected.add(checkbox.dataset.select) : selected.delete(checkbox.dataset.select); updateSelection(); return; } const remove = event.target.closest('[data-remove-plan]'); if (remove) { selected.delete(remove.dataset.removePlan); remove.closest('.tl-plan-row').remove(); updatePlanTotal(); return; } const revert = event.target.closest('[data-revert]'); if (revert) { if (!confirm('Trả lần bốc này về danh sách chưa xếp xe?')) return; try { await post({ action: 'revert_loading', id: revert.dataset.id, record: { loadingId: revert.dataset.revert } }); await window.KTT_CUSTOMS_REFRESH?.(); render(); } catch (error) { alert(error.message); } } });
  window.addEventListener('ktt-customs-refreshed', () => { if (!workspace.hidden) render(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !workspace.querySelector('.tl-plan').hidden) closePlan(); });

  const style = document.createElement('style'); style.textContent = `
    #cf-truck-workspace{padding:18px;background:#f4f7fb;min-height:calc(100vh - 68px);color:#172033;font-size:12px}#cf-truck-workspace[hidden],.tl-plan[hidden]{display:none!important}.tl-head,.tl-toolbar,.tl-selection,.tl-plan-head,.tl-plan-foot{display:flex;align-items:center;justify-content:space-between;gap:12px}.tl-head h1{font-size:24px;margin:0}.tl-head p{margin:4px 0 0;color:#6c7990}.tl-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}.tl-kpis article{min-height:106px;border:1px solid #dce4ef;border-radius:12px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.tl-kpis span{font-weight:850;color:#607088}.tl-kpis b{font-size:25px;margin:5px 0}.tl-kpis small{color:#7a8799}.tl-toolbar{padding:11px;border:1px solid #dce4ef;border-radius:11px;background:#fff}.tl-toolbar>input{flex:1;height:36px;padding:0 12px;border:1px solid #cad6e5;border-radius:8px}.tl-toolbar select{height:36px;border:1px solid #cad6e5;border-radius:8px;padding:0 9px}.tl-check-all{font-weight:750;white-space:nowrap}.tl-selection{margin:10px 0;padding:10px 13px;border-radius:10px;background:#172840;color:#fff}.tl-selection button:disabled{opacity:.45}.tl-table-wrap{overflow:auto;border:1px solid #dce4ef;border-radius:12px;background:#fff}.tl-table-wrap table{border-collapse:collapse;width:100%;min-width:1500px}.tl-table-wrap th{position:sticky;top:0;z-index:2;padding:12px 9px;background:#e7eef7;color:#43536b;text-align:center;white-space:nowrap}.tl-table-wrap td{padding:11px 9px;border-top:1px solid #e3e9f1;text-align:center;vertical-align:middle}.tl-table-wrap small{display:block;margin-top:4px;color:#78869a}.tl-left{text-align:left!important}.tl-status{display:inline-flex;padding:6px 8px;border-radius:7px;font-weight:800;white-space:nowrap}.tl-status.ready{background:#e8f7ee;color:#168254}.tl-status.partial{background:#fff1dc;color:#bb6507}.tl-status.loaded{background:#e9eef6;color:#506078}.tl-trip{display:grid;grid-template-columns:70px 1fr auto;align-items:center;gap:7px;margin:3px 0;padding:5px 7px;border-radius:6px;background:#f3f6fa}.tl-trip span{white-space:nowrap}.tl-trip button{border:0;background:none;color:#c85e16;font-weight:800;cursor:pointer}.tl-empty{padding:30px!important;color:#748198}.tl-plan{position:fixed;z-index:1000;inset:6vh 4vw auto;background:#fff;border:1px solid #cfd9e7;border-radius:14px;box-shadow:0 24px 70px #17203355;padding:18px;max-height:84vh;overflow:auto}.tl-plan-head h2{margin:0;font-size:21px}.tl-plan-head p{margin:4px 0;color:#6e7d92}.tl-plan-close{border:0;background:none;font-size:28px;cursor:pointer}.tl-plan-meta{display:grid;grid-template-columns:1fr 220px 2fr;gap:12px;margin:15px 0}.tl-plan-meta label,.tl-plan-row label{display:grid;gap:5px;font-weight:750}.tl-plan-meta input,.tl-plan-row input{height:38px;box-sizing:border-box;padding:0 10px;border:1px solid #cbd6e5;border-radius:7px}.tl-plan-rows{display:grid;gap:7px}.tl-plan-row{display:grid;grid-template-columns:minmax(260px,1fr) 170px 170px 60px;align-items:end;gap:12px;padding:10px;border:1px solid #dce4ef;border-radius:9px;background:#f8fafc}.tl-plan-row>div{display:grid;gap:4px}.tl-plan-row small{color:#6f7d91}.tl-plan-row button{height:38px;border:0;background:none;color:#c85e16;font-weight:800;cursor:pointer}.tl-plan-foot{margin-top:14px;padding-top:14px;border-top:1px solid #e1e7ef;justify-content:flex-end}.tl-plan-foot span{margin-right:auto;font-weight:850}@media(max-width:900px){.tl-kpis{grid-template-columns:repeat(2,1fr)}.tl-toolbar{align-items:stretch;flex-direction:column}.tl-plan-meta{grid-template-columns:1fr}.tl-plan-row{grid-template-columns:1fr 1fr}.tl-plan{inset:3vh 2vw auto}}
  `; document.head.appendChild(style); render();
})();
