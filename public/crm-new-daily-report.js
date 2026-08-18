(() => {
  const style = document.createElement('style');
  style.textContent = '.crm-report{background:#fff;border:1px solid #d9e1ec;border-radius:11px;color:#344054;padding:0 18px;font:700 15px inherit;cursor:pointer;white-space:nowrap}.crm-report:hover{background:#f5f8fc}.crm-report-modal .crm-box{width:min(940px,calc(100vw - 36px))!important}.crm-report-body{padding:24px 30px 30px}.crm-report-date{display:flex;align-items:center;gap:12px;margin-bottom:20px;color:#687891;font-weight:700}.crm-report-date input,.crm-report-date select{border:1px solid #d5dfeb;border-radius:10px;padding:10px 12px;font:inherit;color:#344054;background:#fff}.crm-report-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.crm-report-card{border:1px solid #e0e7f0;border-radius:14px;padding:15px;background:#fff}.crm-report-card b{display:block;font-size:25px;margin:6px 0}.crm-report-card span{color:#728099;font-size:13px;font-weight:700}.crm-report-card.emphasis{background:#fff7ef;border-color:#ffd7bd}.crm-report-section{margin:24px 0 12px;font-size:17px;font-weight:800;color:#344054}@media(max-width:700px){.crm-report-grid{grid-template-columns:repeat(2,1fr)}.crm-report-body{padding:18px}.crm-report-date{align-items:flex-start;flex-direction:column}}';
  document.head.append(style);

  const button = document.createElement('button');
  button.className = 'crm-report';
  button.type = 'button';
  button.textContent = '▥ Báo cáo';
  document.querySelector('.searchbar').insertBefore(button, document.querySelector('.add'));

  const modal = document.createElement('div');
  modal.className = 'crm-modal crm-report-modal';
  modal.innerHTML = `<div class="crm-box"><div class="crm-head"><span>Báo cáo hoạt động Sale</span><button class="crm-close" aria-label="Đóng">×</button></div><div class="crm-report-body"><div class="crm-report-date"><label>Xem theo <select id="crm-report-period"><option value="day">Ngày</option><option value="month">Tháng</option></select></label><label id="crm-report-day-label">Chọn ngày <input id="crm-report-date" type="date"></label><label id="crm-report-month-label" hidden>Chọn tháng <input id="crm-report-month" type="month"></label></div><div id="crm-report-content"></div></div><div class="crm-foot"><button class="crm-cancel">Đóng</button></div></div>`;
  document.body.append(modal);

  const dateInput = modal.querySelector('#crm-report-date');
  const monthInput = modal.querySelector('#crm-report-month');
  const periodInput = modal.querySelector('#crm-report-period');
  const content = modal.querySelector('#crm-report-content');
  const pad = number => String(number).padStart(2, '0');
  const localIso = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const rowDate = row => {
    const [day, month, year] = (row.cells[0]?.textContent || '').trim().split('/').map(Number);
    return day && month && year ? `${year}-${pad(month)}-${pad(day)}` : '';
  };
  const card = (label, value, emphasis = false) => `<article class="crm-report-card${emphasis ? ' emphasis' : ''}"><span>${label}</span><b>${value}</b></article>`;
  const render = () => {
    const selectedPeriod = periodInput.value === 'month' ? monthInput.value : dateInput.value;
    const rows = [...document.querySelectorAll('#rows tr')].filter(row => periodInput.value === 'month' ? rowDate(row).startsWith(selectedPeriod) : rowDate(row) === selectedPeriod);
    const countStatus = value => rows.filter(row => row.cells[6]?.querySelector('select')?.value === value).length;
    const countCategory = value => rows.filter(row => row.cells[7]?.querySelector('select')?.value === value).length;
    content.innerHTML = `<div class="crm-report-grid">${card('DATA MỚI', rows.length, true)}${card('ĐÃ GỬI KẾT BẠN', countStatus('Đã gửi lời mời kết bạn'))}${card('ĐÃ KẾT BẠN', countStatus('Đã kết bạn'))}${card('ĐÃ GỬI TIN, CHƯA PHẢN HỒI', countStatus('Đã gửi tin nhắn khách chưa phản hồi'))}${card('KHÁCH ĐÃ TƯƠNG TÁC', countStatus('Khách đã tương tác'))}${card('ĐÃ TƯ VẤN DỊCH VỤ', countStatus('Đã tư vấn dịch vụ'))}${card('KHÁCH ĐANG XEM XÉT', countStatus('Khách đang xem xét'))}${card('KHÁCH CHỐT', countStatus('Khách chốt'), true)}</div><div class="crm-report-section">Phân loại khách hàng</div><div class="crm-report-grid">${card('KHÁCH CỰC KỲ TIỀM NĂNG', countCategory('Khách cực kỳ tiềm năng'), true)}${card('KHÁCH TIỀM NĂNG', countCategory('Khách tiềm năng'))}${card('KHÁCH KHÔNG TIỀM NĂNG', countCategory('Khách không tiềm năng'))}${card('KHÁCH KHÔNG CHỐT', countStatus('Khách không chốt'))}</div>`;
  };
  const close = () => modal.classList.remove('open');
  button.onclick = () => { const now = new Date(); dateInput.value = localIso(now); monthInput.value = localIso(now).slice(0, 7); render(); modal.classList.add('open'); };
  dateInput.onchange = render;
  monthInput.onchange = render;
  periodInput.onchange = () => { const monthly = periodInput.value === 'month'; modal.querySelector('#crm-report-day-label').hidden = monthly; modal.querySelector('#crm-report-month-label').hidden = !monthly; render(); };
  document.querySelector('#rows').addEventListener('change', () => { if (modal.classList.contains('open')) render(); });
  new MutationObserver(() => { if (modal.classList.contains('open')) render(); }).observe(document.querySelector('#rows'), { childList: true, subtree: true });
  modal.querySelector('.crm-close').onclick = close;
  modal.querySelector('.crm-cancel').onclick = close;
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
})();
