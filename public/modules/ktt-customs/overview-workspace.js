(() => {
  'use strict';
  const root = document.getElementById('customs-flow-app');
  const main = root?.querySelector('.cf-main');
  const original = root?.querySelector('.cf-content');
  if (!root || !main || !original) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const rows = () => Array.isArray(window.KTT_CUSTOMS_DATA) ? window.KTT_CUSTOMS_DATA : [];
  const number = value => Number(value || 0) || 0;
  const volume = items => items.reduce((total, item) => total + number(item.m3), 0);
  const count = status => rows().filter(item => item._status === status).length;
  const shipped = () => rows().filter(item => item._status === 'loaded').length;
  const saleDone = () => rows().filter(item => !['sale_required'].includes(item._status)).length;
  const listDone = () => rows().filter(item => ['customer_confirmation', 'ready_for_loading', 'loaded'].includes(item._status)).length;
  const confirmed = () => rows().filter(item => ['ready_for_loading', 'loaded'].includes(item._status)).length;
  const label = status => ({ sale_required: 'Chờ Sale bổ sung', customs_pending: 'Chờ khai báo lên list', customer_confirmation: 'Chờ khách xác nhận', ready_for_loading: 'Chờ xếp xe', loaded: 'Đã xếp xe' }[status] || 'Đang xử lý');
  const state = status => ({ sale_required: 'sale', customs_pending: 'customs', customer_confirmation: 'customer', ready_for_loading: 'ready', loaded: 'loaded' }[status] || 'sale');

  const workspace = document.createElement('section');
  workspace.id = 'cf-overview-workspace';
  workspace.hidden = true;
  workspace.innerHTML = `<div class="ov-head"><div><p class="ov-eyebrow">KTT KHAI BÁO HQ · BẢNG ĐIỀU HÀNH</p><h1>Tổng quan vận hành</h1><p>Theo dõi xuyên suốt công việc của Điều vận, Sale và Khai báo HQ.</p></div><button class="cf-action ov-refresh">↻ Cập nhật số liệu</button></div><div class="ov-kpis"></div><div class="ov-grid"><section class="ov-panel ov-flow"><header><div><h2>Tiến độ luồng hàng</h2><p>Tình trạng hiện tại của toàn bộ mã hàng</p></div><b class="ov-percent"></b></header><div class="ov-flow-bars"></div></section><section class="ov-panel ov-pie"><header><div><h2>Tỷ lệ hoàn tất</h2><p>Mã đã khách xác nhận hoặc đã xếp xe</p></div></header><div class="ov-ring"><b></b><span>hoàn tất</span></div><div class="ov-ring-note"></div></section></div><section class="ov-panel ov-team"><header><div><h2>Hiệu suất theo bộ phận</h2><p>Chỉ số để điều phối công việc trong ngày</p></div></header><div class="ov-team-grid"></div></section><section class="ov-panel ov-recent"><header><div><h2>Danh sách cần ưu tiên</h2><p>Các mã đang chờ xử lý ở bước tiếp theo</p></div></header><div class="ov-recent-list"></div></section>`;
  main.appendChild(workspace);

  const nav = [...root.querySelectorAll('.cf-nav button')];
  const button = nav.find(item => /Tổng quan/i.test(item.textContent || ''));
  if (!button) return;
  button.id = 'cf-overview-open';

  function metric(title, value, note, tone) {
    return `<article class="ov-kpi ${tone}"><span>${title}</span><b>${value}</b><small>${note}</small></article>`;
  }
  function render() {
    const total = rows().length;
    const ready = count('ready_for_loading');
    const loaded = shipped();
    const done = confirmed();
    const rate = total ? Math.round(done / total * 100) : 0;
    const stages = [
      ['Chờ Sale bổ sung', count('sale_required'), 'sale'],
      ['Chờ khai báo lên list', count('customs_pending'), 'customs'],
      ['Chờ khách xác nhận', count('customer_confirmation'), 'customer'],
      ['Chờ xếp xe', ready, 'ready'],
      ['Đã xếp xe', loaded, 'loaded']
    ];
    workspace.querySelector('.ov-kpis').innerHTML = [
      metric('ĐÃ NHẬP KHO TQ', total, 'Tổng mã hàng đang theo dõi', 'navy'),
      metric('SALE ĐÃ BỔ SUNG', saleDone(), `Còn ${count('sale_required')} mã cần Sale xử lý`, 'blue'),
      metric('ĐÃ CÓ LIST KHAI BÁO', listDone(), `Còn ${count('customs_pending')} mã chờ Khai báo`, 'purple'),
      metric('KHÁCH ĐÃ XÁC NHẬN', done, `Còn ${count('customer_confirmation')} mã chờ phản hồi`, 'amber'),
      metric('ĐÃ XẾP XE', loaded, `Còn ${ready} mã sẵn sàng xếp`, 'green'),
      metric('KHỐI HÀNG SẴN SÀNG', `${volume(rows().filter(item => ['ready_for_loading', 'loaded'].includes(item._status))).toFixed(2).replace('.', ',')} m³`, `${volume(rows().filter(item => item._status === 'ready_for_loading')).toFixed(2).replace('.', ',')} m³ chưa xếp xe`, 'orange')
    ].join('');
    workspace.querySelector('.ov-percent').textContent = `${rate}% hoàn tất`;
    workspace.querySelector('.ov-flow-bars').innerHTML = stages.map(([name, value, tone]) => `<div class="ov-stage"><div><span>${name}</span><b>${value} mã</b></div><i><em class="${tone}" style="width:${total ? Math.max(value ? 4 : 0, value / total * 100) : 0}%"></em></i></div>`).join('');
    workspace.querySelector('.ov-ring').style.setProperty('--percent', `${rate * 3.6}deg`);
    workspace.querySelector('.ov-ring b').textContent = `${rate}%`;
    workspace.querySelector('.ov-ring-note').textContent = `${done}/${total} mã đã được khách xác nhận hoặc đã xếp xe`;
    const team = [
      ['Trang điều vận', `${ready + loaded} mã`, `${ready} mã sẵn sàng · ${loaded} mã đã xếp`, 'ready'],
      ['Sale', `${saleDone()}/${total} mã`, `${count('sale_required')} mã cần bổ sung thông tin`, 'blue'],
      ['Khai báo HQ', `${listDone()}/${total} mã`, `${count('customs_pending')} mã chờ lên list`, 'purple']
    ];
    workspace.querySelector('.ov-team-grid').innerHTML = team.map(([name, value, note, tone]) => `<article class="ov-team-card ${tone}"><span>${name}</span><b>${value}</b><small>${note}</small></article>`).join('');
    const priority = rows().filter(item => !['loaded'].includes(item._status)).slice(0, 8);
    workspace.querySelector('.ov-recent-list').innerHTML = priority.length ? priority.map(item => `<div class="ov-row"><div><b>${esc(item.code)}</b><span>${esc(item.name)} · ${esc(item.customer)}</span></div><small>${esc(item.owner || item.sale || 'Chưa phân công')}</small><strong class="${state(item._status)}">${label(item._status)}</strong></div>`).join('') : '<div class="ov-empty">Không còn mã hàng cần xử lý.</div>';
  }
  function close() { workspace.hidden = true; original.hidden = false; button.classList.remove('active'); }
  function open() {
    original.hidden = true;
    root.querySelectorAll('#cf-processing-workspace,#cf-sale-supplement-workspace,#cf-customs-list-workspace,#cf-truck-loading-workspace,#cf-customs-documents-workspace,#cf-warehouse-workspace').forEach(item => item?.setAttribute('hidden', ''));
    workspace.hidden = false;
    root.querySelectorAll('.cf-nav button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    render();
  }
  button.addEventListener('click', open);
  workspace.querySelector('.ov-refresh').addEventListener('click', async () => { await window.KTT_CUSTOMS_REFRESH?.(); render(); });
  window.addEventListener('ktt-customs-refreshed', () => { if (!workspace.hidden) render(); });
  document.addEventListener('click', event => { const item = event.target.closest('.cf-nav button'); if (item && item !== button && !workspace.hidden) close(); });

  const style = document.createElement('style');
  style.textContent = `#cf-overview-workspace{min-height:calc(100vh - 68px);padding:26px;background:linear-gradient(145deg,#f6f9fe,#edf3fb);color:#172237}#cf-overview-workspace[hidden]{display:none!important}.ov-head,.ov-panel header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.ov-eyebrow{margin:0 0 6px;color:#5472a1;font-size:11px;font-weight:850;letter-spacing:.08em}.ov-head h1{margin:0;font-size:31px;letter-spacing:-.03em}.ov-head p:not(.ov-eyebrow),.ov-panel header p{margin:6px 0 0;color:#6d7d94}.ov-kpis{display:grid;grid-template-columns:repeat(6,minmax(150px,1fr));gap:12px;margin:22px 0}.ov-kpi,.ov-panel{border:1px solid #dce5f1;border-radius:15px;background:#fff;box-shadow:0 8px 25px #1b31570d}.ov-kpi{position:relative;min-height:130px;padding:17px;overflow:hidden}.ov-kpi:before{content:'';position:absolute;inset:0 auto 0 0;width:4px;background:var(--tone)}.ov-kpi span,.ov-kpi small{display:block;color:#718198;font-size:11px;font-weight:750}.ov-kpi b{display:block;margin:10px 0 8px;font-size:26px;line-height:1;color:#172237}.ov-kpi small{font-weight:550;line-height:1.35}.ov-kpi.navy{--tone:#263d67}.ov-kpi.blue{--tone:#3679cf}.ov-kpi.purple{--tone:#7a5ac8}.ov-kpi.amber{--tone:#d98512}.ov-kpi.green{--tone:#259561}.ov-kpi.orange{--tone:#ec6f24}.ov-grid{display:grid;grid-template-columns:1.6fr .8fr;gap:14px}.ov-panel{padding:19px}.ov-panel h2{margin:0;font-size:17px}.ov-flow-bars{display:grid;gap:14px;margin-top:22px}.ov-stage>div{display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px}.ov-stage span{color:#53637b}.ov-stage b{color:#243653}.ov-stage i{display:block;height:9px;border-radius:99px;background:#eaf0f7;overflow:hidden}.ov-stage em{display:block;height:100%;border-radius:99px;background:#6e87ab}.ov-stage em.sale{background:#3679cf}.ov-stage em.customs{background:#7a5ac8}.ov-stage em.customer{background:#d98512}.ov-stage em.ready{background:#259561}.ov-stage em.loaded{background:#1d5f43}.ov-pie{display:grid;justify-items:center}.ov-pie header{width:100%}.ov-ring{display:grid;place-content:center;width:188px;height:188px;margin:20px 0 10px;border-radius:50%;background:conic-gradient(#259561 var(--percent),#e7edf5 0);position:relative;text-align:center}.ov-ring:before{content:'';position:absolute;inset:17px;border-radius:50%;background:#fff}.ov-ring>*{z-index:1}.ov-ring b{font-size:30px}.ov-ring span{color:#718198;font-size:11px;font-weight:700}.ov-ring-note{color:#66768d;font-size:12px;text-align:center}.ov-team{margin-top:14px}.ov-team-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:17px}.ov-team-card{border-radius:11px;padding:16px;background:#eff5fc;border-left:4px solid #3679cf}.ov-team-card.purple{background:#f3effc;border-color:#7a5ac8}.ov-team-card.ready{background:#edf8f2;border-color:#259561}.ov-team-card span,.ov-team-card small{display:block;color:#63738a}.ov-team-card b{display:block;margin:8px 0;font-size:23px}.ov-recent{margin-top:14px}.ov-recent-list{margin-top:13px}.ov-row{display:grid;grid-template-columns:1.5fr .8fr auto;gap:15px;align-items:center;padding:12px 0;border-top:1px solid #e6edf5}.ov-row:first-child{border-top:0}.ov-row b,.ov-row span{display:block}.ov-row b{font-size:14px}.ov-row span,.ov-row small{margin-top:3px;color:#718198;font-size:12px}.ov-row strong{padding:6px 8px;border-radius:7px;background:#edf3fb;color:#3974bd;font-size:11px}.ov-row strong.customs{background:#f1ecfb;color:#7251ca}.ov-row strong.customer{background:#fff3e3;color:#bc7010}.ov-row strong.ready{background:#e8f7ef;color:#208552}.ov-empty{padding:25px;color:#718198;text-align:center}@media(max-width:1150px){.ov-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:800px){#cf-overview-workspace{padding:15px}.ov-head,.ov-panel header{flex-direction:column}.ov-grid,.ov-team-grid{grid-template-columns:1fr}.ov-kpis{grid-template-columns:repeat(2,1fr)}.ov-row{grid-template-columns:1fr}.ov-row small{margin-top:-10px}}`;
  document.head.appendChild(style);
})();
