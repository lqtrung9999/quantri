(() => {
  'use strict';
  const root = document.getElementById('customs-flow-app'), main = root?.querySelector('.cf-main'), original = root?.querySelector('.cf-content'), nav = root?.querySelector('#cf-import-open');
  if (!root || !main || !original || !nav) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const statusLabel = value => ({ sale_required: 'Chờ Sale bổ sung', customs_pending: 'Chờ Khai báo HQ', customer_confirmation: 'Chờ khách xác nhận', ready_for_loading: 'Sẵn sàng xếp xe', loaded: 'Đã xếp xe', returned_to_customer: 'Trả lại khách hàng' }[value] || value || '—');
  const workspace = document.createElement('section');
  workspace.id = 'cf-warehouse-workspace'; workspace.hidden = true;
  workspace.innerHTML = `<div class="wh-head"><div><h1>Nhập kho TQ</h1><p>Quản lý toàn bộ mã hàng do Kho TQ nhập. Điều vận chỉ được sửa Mã hàng, KG và M³.</p></div><div><button class="cf-action" id="wh-refresh">↻ Cập nhật</button><button class="cf-action primary" id="wh-new">＋ Nhập dữ liệu mới</button></div></div><div class="wh-cards" id="wh-cards"></div><div class="wh-tools"><input id="wh-search" placeholder="Tìm mã hàng, tên hàng, mã khách, chủ hàng, Sale..."><select id="wh-filter"><option value="active">Đang xử lý</option><option value="returned">Trả lại khách hàng</option><option value="all">Tất cả</option></select></div><div class="wh-summary" id="wh-summary"></div><div class="wh-table-wrap"><table><thead><tr><th>Ngày vào kho</th><th>Mã hàng</th><th>Số kiện</th><th>Tên hàng</th><th>Mã KH</th><th>Chủ hàng</th><th>Sale</th><th>Phòng</th><th>Kế toán</th><th>KG</th><th>M³</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody id="wh-body"></tbody></table></div>`;
  main.appendChild(workspace);
  let records = [], loading = false;
  const request = async (action, id, record = {}) => {
    const response = await fetch('/api/customs-coordination', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, record }) });
    const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Không thể lưu thay đổi.'); return body;
  };
  async function refresh() {
    if (loading) return; loading = true;
    try { const response = await fetch('/api/customs-coordination?view=warehouse', { credentials: 'same-origin', cache: 'no-store' }), body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Không thể tải dữ liệu Nhập kho TQ.'); records = body.rows || []; render(); }
    catch (error) { alert(error.message || 'Không thể tải dữ liệu Nhập kho TQ.'); }
    finally { loading = false; }
  }
  function visibleRecords() {
    const query = workspace.querySelector('#wh-search').value.trim().toLocaleLowerCase('vi-VN'), filter = workspace.querySelector('#wh-filter').value;
    return records.filter(row => (filter === 'all' || (filter === 'returned' ? row.status === 'returned_to_customer' : row.status !== 'returned_to_customer')) && (!query || `${row.cargoCode} ${row.productName} ${row.customerCode} ${row.ownerName} ${row.saleOwner}`.toLocaleLowerCase('vi-VN').includes(query)));
  }
  function render() {
    const visible = visibleRecords(), active = records.filter(row => row.status !== 'returned_to_customer'), returned = records.filter(row => row.status === 'returned_to_customer');
    workspace.querySelector('#wh-cards').innerHTML = `<button data-filter="active"><span>ĐANG XỬ LÝ</span><b>${active.length}</b><small>${active.reduce((sum, row) => sum + Number(row.volumeM3 || 0), 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} m³</small></button><button data-filter="returned"><span>TRẢ LẠI KHÁCH HÀNG</span><b>${returned.length}</b><small>Không còn trong luồng xử lý</small></button><button data-filter="all"><span>TỔNG MÃ ĐÃ NHẬP</span><b>${records.length}</b><small>${records.reduce((sum, row) => sum + Number(row.packageCount || 0), 0).toLocaleString('vi-VN')} kiện</small></button>`;
    workspace.querySelector('#wh-summary').textContent = `${visible.length} mã hàng đang hiển thị`;
    workspace.querySelector('#wh-body').innerHTML = visible.length ? visible.map(row => `<tr data-id="${esc(row.id)}" class="${row.status === 'returned_to_customer' ? 'returned' : ''}"><td>${esc(row.operationDate)}</td><td><input class="wh-code" value="${esc(row.cargoCode)}"></td><td>${Number(row.packageCount || 0).toLocaleString('vi-VN')}</td><td class="text">${esc(row.productName)}</td><td>${esc(row.customerCode)}</td><td class="text">${esc(row.ownerName)}</td><td>${esc(row.saleOwner)}</td><td>${esc(row.saleTeam)}</td><td>${esc(row.accountant)}</td><td><input class="wh-kg" inputmode="decimal" value="${esc(row.weightKg ?? '')}"></td><td><input class="wh-m3" inputmode="decimal" value="${esc(row.volumeM3 ?? '')}"></td><td><span class="wh-status ${esc(row.status)}">${esc(statusLabel(row.status))}</span>${row.returnedToCustomerReason ? `<small>${esc(row.returnedToCustomerReason)}</small>` : ''}</td><td><button class="wh-save">Lưu sửa đổi</button>${row.status === 'returned_to_customer' ? '<button class="wh-restore">Khôi phục xử lý</button>' : '<button class="wh-return">Trả lại khách hàng</button>'}</td></tr>`).join('') : '<tr><td colspan="13" class="empty">Không có mã hàng phù hợp.</td></tr>';
  }
  workspace.addEventListener('click', async event => {
    const filter = event.target.closest('[data-filter]'); if (filter) { workspace.querySelector('#wh-filter').value = filter.dataset.filter; render(); return; }
    const row = event.target.closest('tr[data-id]'); if (!row) return;
    try {
      if (event.target.closest('.wh-save')) {
        await request('update_warehouse', row.dataset.id, { cargoCode: row.querySelector('.wh-code').value, weightKg: row.querySelector('.wh-kg').value, volumeM3: row.querySelector('.wh-m3').value }); alert('Đã lưu Mã hàng, KG và M³; lịch sử chỉnh sửa đã được ghi lại.');
      } else if (event.target.closest('.wh-return')) {
        const reason = window.prompt('Nhập lý do trả lại khách hàng:'); if (!reason?.trim()) return; if (!window.confirm('Mã này sẽ được đưa ra khỏi toàn bộ quy trình Sale, Khai báo và Xếp xe. Tiếp tục?')) return;
        await request('return_to_customer', row.dataset.id, { reason: reason.trim() });
      } else if (event.target.closest('.wh-restore')) {
        if (!window.confirm('Khôi phục mã hàng này vào quy trình xử lý?')) return; await request('restore_customer_return', row.dataset.id);
      } else return;
      await refresh(); await window.KTT_CUSTOMS_REFRESH?.();
    } catch (error) { alert(error.message || 'Không thể lưu thay đổi.'); }
  });
  function open() {
    original.hidden = true; root.querySelector('#cf-processing-workspace')?.setAttribute('hidden', ''); root.querySelector('#cf-truck-loading-workspace')?.setAttribute('hidden', ''); root.querySelector('#cf-customs-documents-workspace')?.setAttribute('hidden', ''); workspace.hidden = false;
    root.querySelectorAll('.cf-nav button').forEach(button => button.classList.remove('active')); nav.classList.add('active'); refresh();
  }
  nav.onclick = event => { event.preventDefault(); event.stopPropagation(); open(); };
  root.querySelectorAll('.cf-nav button').forEach(button => { if (button !== nav) button.addEventListener('click', () => { workspace.hidden = true; }); });
  workspace.querySelector('#wh-new').onclick = () => { const modal = root.querySelector('#cf-import-modal'); if (modal) { modal.classList.add('open'); modal.querySelector('#cf-import-paste')?.focus({ preventScroll: true }); } };
  workspace.querySelector('#wh-refresh').onclick = refresh; workspace.querySelector('#wh-search').oninput = render; workspace.querySelector('#wh-filter').onchange = render;
  window.addEventListener('ktt-warehouse-imported', refresh);
  const style = document.createElement('style'); style.textContent = `#cf-warehouse-workspace{padding:18px;background:#f4f7fb;min-height:calc(100vh - 68px);color:#172033;font-size:12px}#cf-warehouse-workspace[hidden]{display:none!important}.wh-head{display:flex;align-items:center;justify-content:space-between;gap:16px}.wh-head h1{margin:0;font-size:24px}.wh-head p{margin:5px 0 0;color:#6b7890}.wh-head>div:last-child{display:flex;gap:8px}.wh-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}.wh-cards button{min-height:100px;padding:16px;border:1px solid #dce4ef;border-radius:12px;background:#fff;color:#172033;text-align:center;cursor:pointer}.wh-cards span,.wh-cards small{display:block;color:#6c7990;font-weight:700}.wh-cards b{display:block;margin:7px;font-size:25px}.wh-tools{display:flex;gap:10px;margin-bottom:10px;padding:10px;background:#fff;border:1px solid #dce4ef;border-radius:11px}.wh-tools input{flex:1}.wh-tools input,.wh-tools select{height:38px;box-sizing:border-box;padding:0 11px;border:1px solid #ccd7e5;border-radius:8px}.wh-summary{margin:8px 2px;color:#69768b}.wh-table-wrap{overflow:auto;max-height:calc(100vh - 330px);border:1px solid #dce4ef;border-radius:12px;background:#fff}.wh-table-wrap table{border-collapse:separate;border-spacing:0;min-width:1760px;width:100%}.wh-table-wrap th{position:sticky;top:0;z-index:2;padding:12px 9px;background:#dcefc9;color:#294125;text-align:center;border-right:1px solid #c1d5af}.wh-table-wrap td{padding:9px;border-top:1px solid #e1e7ef;border-right:1px solid #e1e7ef;text-align:center;vertical-align:middle}.wh-table-wrap td.text{text-align:left;min-width:180px}.wh-table-wrap input{box-sizing:border-box;width:120px;height:38px;padding:0 8px;border:1px solid #aebaca;border-radius:7px;text-align:center;font-weight:700}.wh-table-wrap tr.returned td{background:#faf4f4;color:#7c6570}.wh-status{display:inline-block;padding:6px 8px;border-radius:7px;background:#edf2f8;font-weight:800;white-space:nowrap}.wh-status.returned_to_customer{background:#fbe7e7;color:#a33434}.wh-table-wrap td small{display:block;max-width:170px;margin-top:5px;color:#a04a4a;white-space:normal}.wh-table-wrap td:last-child button{display:block;width:145px;margin:4px auto;padding:7px;border:1px solid #ccd7e5;border-radius:7px;background:#fff;font-weight:750;cursor:pointer}.wh-table-wrap .wh-save{background:#168a5b!important;color:#fff;border-color:#168a5b!important}.wh-table-wrap .wh-return{color:#b33434;border-color:#dfb5b5}.wh-table-wrap .empty{padding:30px;color:#748197}@media(max-width:900px){.wh-cards{grid-template-columns:1fr}.wh-head{align-items:flex-start;flex-direction:column}.wh-table-wrap{max-height:none}}`; document.head.appendChild(style);
})();
