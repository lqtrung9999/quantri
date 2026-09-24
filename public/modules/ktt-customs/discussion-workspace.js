(() => {
  'use strict';
  const root = document.getElementById('customs-flow-app');
  if (!root) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const roleLabel = role => ({ manager: 'Giám đốc / Quản lý', customs_declaration: 'Khai báo HQ', truck_planner: 'Điều vận', cn_operations: 'Điều vận', warehouse_cn: 'Kho TQ', accounting: 'Kế toán', sale: 'Sale', admin: 'Quản trị viên' }[role] || 'Thành viên');
  const time = value => { const date = new Date(value || ''); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  const allRows = () => Array.isArray(window.KTT_CUSTOMS_DATA) ? window.KTT_CUSTOMS_DATA : [];
  let currentId = '';
  const panel = document.createElement('section');
  panel.id = 'cf-shipment-discussion'; panel.hidden = true;
  panel.innerHTML = `<div class="sd-dialog" role="dialog" aria-modal="true" aria-labelledby="sd-title"><header><div><p>TRAO ĐỔI NỘI BỘ THEO MÃ HÀNG</p><h2 id="sd-title"></h2><span class="sd-subtitle"></span></div><button type="button" class="sd-close" aria-label="Đóng">×</button></header><div class="sd-guidance">Nội dung được chia sẻ cho các bộ phận có quyền xem mã hàng này: Điều vận, Sale, Khai báo HQ và Quản lý.</div><div class="sd-thread"></div><section class="sd-compose"><label for="sd-message">Nội dung trao đổi</label><textarea id="sd-message" maxlength="4000" placeholder="Nêu vấn đề, thông tin cần xác nhận hoặc quyết định cần chốt..."></textarea><div><small class="sd-feedback" role="status">Trao đổi được lưu theo riêng từng mã hàng.</small><button type="button" class="sd-send">Gửi trao đổi</button></div></section></div>`;
  document.body.appendChild(panel);
  const current = () => allRows().find(row => row._id === currentId);
  const render = () => {
    const shipment = current();
    if (!shipment) return close();
    panel.querySelector('#sd-title').textContent = shipment.code || 'Trao đổi mã hàng';
    panel.querySelector('.sd-subtitle').textContent = [shipment.name, shipment.customer, shipment.owner].filter(Boolean).join(' · ');
    const messages = Array.isArray(shipment.discussions) ? shipment.discussions : [];
    panel.querySelector('.sd-thread').innerHTML = messages.length ? messages.map(message => `<article class="sd-message"><div class="sd-avatar">${esc(String(message.actor || 'KTT').trim().slice(0, 1).toUpperCase())}</div><div><header><b>${esc(message.actor || 'Thành viên')}</b><span>${esc(roleLabel(message.actorRole))} · ${esc(time(message.createdAt))}</span></header><p>${esc(message.content).replace(/\n/g, '<br>')}</p></div></article>`).join('') : '<div class="sd-empty">Chưa có trao đổi. Hãy ghi nội dung cần phối hợp cho mã hàng này.</div>';
  };
  const close = () => { panel.hidden = true; currentId = ''; };
  const open = shipment => { const id = typeof shipment === 'string' ? shipment : shipment?._id; if (!id) return; currentId = id; panel.hidden = false; render(); panel.querySelector('#sd-message').focus(); };
  window.KTT_CUSTOMS_DISCUSSION = { open, close };
  document.addEventListener('click', event => { const button = event.target.closest('[data-discussion-id]'); if (button) open(button.dataset.discussionId); });
  panel.querySelector('.sd-close').addEventListener('click', close);
  panel.addEventListener('click', event => { if (event.target === panel) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) close(); });
  const sendDiscussion = async () => {
    const input = panel.querySelector('#sd-message'), content = input.value.trim();
    const submit = panel.querySelector('.sd-send'), feedback = panel.querySelector('.sd-feedback');
    if (!content) { feedback.textContent = 'Vui lòng nhập nội dung trao đổi trước khi gửi.'; input.focus(); return; }
    if (!currentId) return;
    submit.disabled = true; feedback.textContent = 'Đang gửi trao đổi…';
    try {
      const response = await fetch('/api/customs-coordination', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_discussion', id: currentId, record: { content } }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Không thể gửi trao đổi.');
      const shipment = current();
      if (shipment && payload.message) shipment.discussions = [...(shipment.discussions || []), payload.message];
      input.value = ''; render(); feedback.textContent = 'Đã gửi trao đổi.'; await window.KTT_CUSTOMS_REFRESH?.();
    } catch (error) { feedback.textContent = error.message || 'Không thể gửi trao đổi. Vui lòng thử lại.'; }
    finally { submit.disabled = false; }
  };
  panel.addEventListener('click', event => {
    if (!event.target.closest('.sd-send')) return;
    event.preventDefault(); event.stopPropagation();
    sendDiscussion();
  }, true);
  const style = document.createElement('style');
  style.textContent = `#cf-shipment-discussion{position:fixed;z-index:5000;inset:0;display:grid;place-items:center;padding:24px;background:#1522389c;color:#172237}#cf-shipment-discussion[hidden]{display:none!important}#cf-shipment-discussion .sd-dialog{display:grid;grid-template-rows:auto auto minmax(180px,1fr) auto;width:min(760px,94vw);max-height:min(810px,90vh);overflow:hidden;border:1px solid #dbe4f0;border-radius:17px;background:#fff;box-shadow:0 25px 80px #0d192c78}#cf-shipment-discussion .sd-dialog>header{display:flex;justify-content:space-between;gap:18px;padding:20px 22px 16px;border-bottom:1px solid #e4eaf2}#cf-shipment-discussion .sd-dialog>header p{margin:0 0 5px;color:#5c78a6;font-size:10px;font-weight:850;letter-spacing:.08em}#cf-shipment-discussion h2{margin:0;font-size:23px;letter-spacing:-.02em}#cf-shipment-discussion .sd-subtitle{display:block;margin-top:5px;color:#708098;font-size:12px}#cf-shipment-discussion .sd-close{width:34px;height:34px;border:0;border-radius:8px;background:#f1f4f8;color:#52627b;font-size:25px;line-height:1;cursor:pointer}#cf-shipment-discussion .sd-guidance{margin:14px 18px 0;padding:9px 11px;border-radius:8px;background:#edf4ff;color:#4d6991;font-size:12px;line-height:1.4}#cf-shipment-discussion .sd-thread{min-height:180px;overflow:auto;padding:15px 22px}#cf-shipment-discussion .sd-message{display:grid;grid-template-columns:34px 1fr;gap:10px;padding:11px 0;border-bottom:1px solid #edf1f5}#cf-shipment-discussion .sd-message:last-child{border-bottom:0}#cf-shipment-discussion .sd-avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#eaf1fc;color:#356ab3;font-size:12px;font-weight:850}#cf-shipment-discussion .sd-message header{display:flex;align-items:baseline;gap:7px}#cf-shipment-discussion .sd-message b{font-size:13px}#cf-shipment-discussion .sd-message header span{color:#7c8aa0;font-size:11px}#cf-shipment-discussion .sd-message p{margin:5px 0 0;color:#27364c;font-size:13px;line-height:1.55;white-space:normal;word-break:break-word}#cf-shipment-discussion .sd-empty{display:grid;place-items:center;min-height:160px;color:#7a889b;text-align:center;font-size:13px}#cf-shipment-discussion .sd-compose{padding:15px 22px 18px;border-top:1px solid #e4eaf2;background:#fbfcfe}#cf-shipment-discussion .sd-compose label{display:block;margin-bottom:6px;color:#53637b;font-size:12px;font-weight:800}#cf-shipment-discussion .sd-compose textarea{box-sizing:border-box;width:100%;min-height:82px;resize:vertical;border:1px solid #cfdae8;border-radius:9px;padding:10px;font:13px/1.45 inherit;color:#24334a;outline-color:#5791e4}#cf-shipment-discussion .sd-compose>div{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:9px}#cf-shipment-discussion .sd-feedback{color:#6d7d94;font-size:11px}#cf-shipment-discussion .sd-send{border:0;border-radius:8px;background:#ff7922;color:#fff;padding:10px 14px;font:800 13px inherit;cursor:pointer}#cf-shipment-discussion .sd-send:disabled{cursor:wait;opacity:.65}@media(max-width:600px){#cf-shipment-discussion{padding:10px}#cf-shipment-discussion .sd-dialog{width:100%;max-height:95vh}#cf-shipment-discussion .sd-dialog>header,#cf-shipment-discussion .sd-thread,#cf-shipment-discussion .sd-compose{padding-left:15px;padding-right:15px}}`;
  document.head.appendChild(style);
})();
