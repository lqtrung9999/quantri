(() => {
  const STATUS = ['', 'Đã gửi lời mời kết bạn', 'Đã kết bạn', 'Đã gửi tin nhắn khách chưa phản hồi', 'Khách đã tương tác', 'Đã tư vấn dịch vụ'];
  const CATEGORY = ['', 'Khách cực kỳ tiềm năng', 'Khách tiềm năng', 'Khách không tiềm năng'];
  const RESULT = ['', 'Đã Chốt', 'Chưa Chốt Được'];
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const dateText = iso => { const [year, month, day] = String(iso || '').slice(0, 10).split('-'); return year ? `${day}/${month}/${year}` : '—'; };
  const initials = name => String(name || '').split(/\s+/).map(word => word[0]).slice(-2).join('').toUpperCase();
  const localIso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  let user, leads = [], activeTab = 'all', currentNote;
  $('#rows').innerHTML = '';

  const style = document.createElement('style');
  style.textContent = '.crm-report{background:#fff;border:1px solid #d9e1ec;border-radius:11px;color:#344054;padding:0 18px;font:700 15px inherit;cursor:pointer;white-space:nowrap}.crm-report:hover{background:#f5f8fc}.metric.archive-card{cursor:pointer}.metric.archive-card:hover,.metric.archive-card.active{border-color:#91a3bb;box-shadow:0 4px 16px #71829a1c}.result-select{min-width:155px!important;width:155px}.new-modal{position:fixed;inset:0;background:#273243aa;z-index:99;display:none;place-items:center;padding:24px}.new-modal.open{display:grid}.new-modal .box{width:min(820px,calc(100vw - 36px));background:#fff;border:1px solid #dce5f0;border-radius:24px;box-shadow:0 25px 70px #0008;overflow:hidden}.new-modal .head{padding:24px 30px;border-bottom:1px solid #e3eaf3;display:flex;justify-content:space-between;font-size:23px;font-weight:800}.new-modal .close{border:0;background:none;font-size:30px;cursor:pointer}.new-modal .body{padding:24px 30px}.new-modal .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px 22px}.new-modal label{display:grid;gap:8px;color:#687891;font-weight:600}.new-modal input,.new-modal select,.new-modal textarea{width:100%;border:1px solid #d5dfeb;border-radius:12px;padding:13px 15px;font:inherit;font-size:15px;color:#344054;background:#fff}.new-modal textarea{height:105px;resize:vertical}.new-modal .full{grid-column:1/-1}.new-modal .foot{padding:18px 30px;border-top:1px solid #e3eaf3;display:flex;justify-content:flex-end;gap:14px}.new-modal button.action{border:0;border-radius:12px;padding:13px 20px;background:#ff7627;color:#fff;font:800 16px inherit;cursor:pointer}.new-modal button.cancel{border:1px solid #d5dfeb;border-radius:12px;padding:13px 20px;background:#fff;color:#202938;font:800 16px inherit;cursor:pointer}.history{max-height:260px;overflow:auto}.history-item{padding:12px 0;border-bottom:1px solid #e3eaf3}.history-meta{display:flex;justify-content:space-between;color:#728099;font-size:13px;font-weight:700}.history-item p{margin:7px 0 0;line-height:1.5}.note-modal .box{width:min(760px,calc(100vw - 36px))}.note-modal .head{padding:20px 26px;font-size:20px}.note-modal .body{padding:20px 26px}.note-modal .history{max-height:300px}.note-modal .history-item{padding:15px 0}.note-modal .history-meta{font-size:14px}.note-modal .history-item p{margin:10px 0 0;font-size:16px;line-height:1.65}.note-modal #note-entry{margin-top:28px;gap:10px;font-size:15px}.note-modal #note-text{height:102px;font-size:16px;line-height:1.55}.note-modal .foot{padding:16px 26px}.report-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.report-card{border:1px solid #e0e7f0;border-radius:13px;padding:13px}.report-card b{display:block;font-size:23px;margin-top:6px}.report-card span{color:#728099;font-size:12px;font-weight:700}.report-section{margin:20px 0 10px;font-size:16px;font-weight:800}.sale-column-hidden th:nth-child(11),.sale-column-hidden td:nth-child(11){display:none}@media(max-width:700px){.new-modal .grid,.report-grid{grid-template-columns:1fr}.new-modal .body{padding:20px}.new-modal .full{grid-column:auto}}';
  document.head.append(style);

  const formModal = document.createElement('div');
  formModal.className = 'new-modal';
  formModal.innerHTML = `<div class="box"><div class="head">Thêm khách hàng tiềm năng<button class="close">×</button></div><form><div class="body grid"><label>Tên khách hàng<input name="name" required placeholder="VD: Nguyễn Thị Lan"></label><label>Số điện thoại<input name="phone" placeholder="09xx xxx xxx"></label><label>Nguồn<select name="source"><option>Facebook</option><option>Google</option><option>Shopee</option><option>TikTok</option><option>Khác</option></select></label><label>Mặt hàng kinh doanh<input name="product" placeholder="VD: Thời trang nữ"></label><label class="full">Link FB / Shopee / TikTok<input name="link" placeholder="https://facebook.com/... hoặc https://shopee.vn/..."></label><label class="full">Ghi chú ban đầu<textarea name="note" placeholder="Nguồn tìm thấy, mặt hàng đang kinh doanh và thông tin cần lưu ý…"></textarea></label></div><div class="foot"><button type="button" class="cancel">Hủy</button><button class="action">Lưu khách hàng</button></div></form></div>`;
  document.body.append(formModal);

  const noteModal = document.createElement('div');
  noteModal.className = 'new-modal note-modal';
  noteModal.innerHTML = `<div class="box"><div class="head"><span id="note-title">Lịch sử tương tác</span><button class="close">×</button></div><div class="body"><div id="note-history" class="history"></div><label id="note-entry">Thêm ghi chú sau lần tương tác<textarea id="note-text" placeholder="VD: Khách đang nhập đồ gia dụng, khoảng 300kg/tháng; hẹn gửi bảng giá vào thứ Sáu…"></textarea></label></div><div class="foot"><button class="cancel">Đóng</button><button class="action" id="save-note">＋ Lưu ghi chú</button></div></div>`;
  document.body.append(noteModal);

  const reportModal = document.createElement('div');
  reportModal.className = 'new-modal';
  reportModal.innerHTML = `<div class="box"><div class="head">Báo cáo hoạt động Sale<button class="close">×</button></div><div class="body"><div class="grid"><label>Xem theo<select id="report-period"><option value="day">Ngày</option><option value="month">Tháng</option></select></label><label id="report-day-wrap">Chọn ngày<input id="report-day" type="date"></label><label id="report-month-wrap" hidden>Chọn tháng<input id="report-month" type="month"></label></div><div id="report-content"></div></div><div class="foot"><button class="cancel">Đóng</button></div></div>`;
  document.body.append(reportModal);

  const api = async (method = 'GET', body) => { const response = await fetch('/api/crm-new/leads', body ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Không thể cập nhật CRM Mới.'); return data; };
  const isOwner = lead => user?.role === 'sale' && String(lead.sale || '').trim().toLocaleLowerCase('vi-VN') === String(user.sale || '').trim().toLocaleLowerCase('vi-VN');
  const select = (values, current, editable, field) => `<select class="status ${field === 'result' ? 'result-select' : ''}" data-field="${field}" ${editable ? '' : 'disabled'}>${values.map(value => `<option value="${esc(value)}" ${value === current ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select>`;
  const sourceClass = source => ({ Facebook: 'fb', Google: 'google', Shopee: 'shopee', TikTok: 'tiktok' }[source] || 'fb');

  function filtered() {
    const search = $('.searchbar input').value.trim().toLocaleLowerCase('vi-VN');
    const [sourceFilter, statusFilter] = [...document.querySelectorAll('.searchbar select')].map(element => element.value);
    return leads.filter(lead => {
      const isNonPotential = lead.category === 'Khách không tiềm năng';
      const isClosed = lead.result === 'Đã Chốt';
      const quick = activeTab === 'all' ? !isNonPotential && !isClosed : activeTab === 'potential' ? !isNonPotential && !isClosed && ['Khách tiềm năng', 'Khách cực kỳ tiềm năng'].includes(lead.category) : activeTab === 'nonpotential' ? isNonPotential && !isClosed : activeTab === 'closed' ? isClosed : !isNonPotential && !isClosed && lead.status === activeTab.slice(7);
      const text = `${lead.name} ${lead.phone} ${lead.product} ${lead.sale}`.toLocaleLowerCase('vi-VN');
      return quick && (!search || text.includes(search)) && (sourceFilter === 'Tất cả nguồn' || lead.source === sourceFilter) && (statusFilter === 'Mọi trạng thái Zalo' || lead.status === statusFilter);
    });
  }
  function renderRows() {
    const showSale = user.role !== 'sale' || user.team;
    document.body.classList.toggle('sale-column-hidden', !showSale);
    const rows = filtered();
    $('#rows').innerHTML = rows.map((lead, index) => {
      const editable = isOwner(lead), notes = Array.isArray(lead.notes) ? lead.notes.length : 0;
      return `<tr data-id="${esc(lead.id)}"><td>${dateText(lead.foundAt)}</td><td class="muted">${index + 1}</td><td><div class="name">${esc(lead.name)}</div><div class="phone">${esc(lead.phone || '—')}</div></td><td><i class="dot ${sourceClass(lead.source)}"></i>${esc(lead.source)}</td><td>${lead.link ? `<a class="link" href="${esc(lead.link)}" target="_blank" rel="noopener noreferrer">↗ Mở link</a>` : '<span class="muted">Chưa có link</span>'}</td><td>${esc(lead.product || 'Chưa cập nhật')}</td><td>${select(STATUS, lead.status || '', editable, 'status')}</td><td>${select(CATEGORY, lead.category || '', editable, 'category')}</td><td><button class="note" type="button">✎ ${notes} ghi chú</button></td><td>${select(RESULT, lead.result || '', editable, 'result')}</td><td><div class="owner"><span class="small-avatar">${esc(initials(lead.sale))}</span>${esc(lead.sale)}</div></td></tr>`;
    }).join('') || `<tr><td colspan="10" style="text-align:center;padding:42px;color:#728099">Chưa có khách hàng tiềm năng. Sale có thể bắt đầu bằng nút “Thêm khách hàng”.</td></tr>`;
  }
  function renderTabs() {
    const tabs = [['all', 'Tất cả'], ...STATUS.slice(1).map(status => [`status:${status}`, status])];
    const workingLeads = leads.filter(lead => lead.category !== 'Khách không tiềm năng' && lead.result !== 'Đã Chốt');
    const count = value => value === 'all' ? workingLeads.length : workingLeads.filter(lead => lead.status === value.slice(7)).length;
    $('.tabs').innerHTML = tabs.map(([value, label]) => `<span data-tab="${esc(value)}" class="${value === activeTab ? 'active' : ''}">${esc(label)} ${count(value)}</span>`).join('');
  }
  function renderFilters() {
    const selects = [...document.querySelectorAll('.searchbar select')];
    const source = selects[0].value || 'Tất cả nguồn', status = selects[1].value || 'Mọi trạng thái Zalo';
    const sources = [...new Set(leads.map(lead => lead.source).filter(Boolean))];
    selects[0].innerHTML = `<option>Tất cả nguồn</option>${sources.map(value => `<option ${value === source ? 'selected' : ''}>${esc(value)}</option>`).join('')}`;
    selects[1].innerHTML = `<option>Mọi trạng thái Zalo</option>${STATUS.slice(1).map(value => `<option ${value === status ? 'selected' : ''}>${esc(value)}</option>`).join('')}`;
  }
  function renderMetrics() {
    const workingLeads = leads.filter(lead => lead.category !== 'Khách không tiềm năng' && lead.result !== 'Đã Chốt');
    const count = predicate => leads.filter(predicate).length, cards = [...document.querySelectorAll('.metric')];
    const values = [leads.length, workingLeads.filter(lead => ['Khách tiềm năng', 'Khách cực kỳ tiềm năng'].includes(lead.category)).length, count(lead => lead.category === 'Khách không tiềm năng' && lead.result !== 'Đã Chốt'), count(lead => lead.result === 'Đã Chốt')];
    const descriptions = ['Tất cả data khách hàng đã tạo', 'Gồm tiềm năng và cực kỳ tiềm năng', 'Theo phân loại khách hàng', 'Khách đã được xác nhận chốt'];
    const labels = ['TỔNG DATA', 'KHÁCH HÀNG TIỀM NĂNG', 'KHÁCH HÀNG KHÔNG TIỀM NĂNG', 'ĐÃ CHỐT'];
    cards.forEach((card, index) => { card.querySelector('.label').textContent = labels[index]; card.querySelector('b').textContent = values[index]; card.querySelector('b + span').textContent = descriptions[index]; card.querySelector('b + span').className = values[index] ? 'green' : ''; });
    cards[2].classList.add('archive-card');
    cards[1].classList.add('archive-card');
    cards[1].classList.toggle('active', activeTab === 'potential');
    cards[1].onclick = () => { activeTab = activeTab === 'potential' ? 'all' : 'potential'; render(); };
    cards[2].classList.toggle('active', activeTab === 'nonpotential');
    cards[2].onclick = () => { activeTab = activeTab === 'nonpotential' ? 'all' : 'nonpotential'; render(); };
    cards[3].classList.add('archive-card');
    cards[3].classList.toggle('active', activeTab === 'closed');
    cards[3].onclick = () => { activeTab = activeTab === 'closed' ? 'all' : 'closed'; render(); };
  }
  function render() { renderFilters(); renderTabs(); renderRows(); renderMetrics(); }
  async function reload() { const data = await api(); user = data.user; leads = data.rows || []; const name = user.name || user.sale || 'Sales'; $('#user').textContent = `${name} · ${user.role === 'sale' ? 'Sales' : user.role === 'accountant' ? 'Kế toán' : 'Admin'}`; $('#avatar').textContent = initials(name); document.querySelectorAll('thead th')[7].textContent = 'PHÂN LOẠI KH'; document.querySelectorAll('thead th')[9].textContent = 'KẾT QUẢ'; document.querySelectorAll('thead th')[10].textContent = 'SALE'; $('.add').hidden = user.role !== 'sale'; render(); }
  async function updateLead(id, patch) { const result = await api('POST', { action: 'update', record: { id, status: patch.status, category: patch.category, result: patch.result } }); const index = leads.findIndex(lead => lead.id === id); if (index >= 0) leads[index] = result.record; render(); }
  function openNotes(lead) { currentNote = lead; $('#note-title').textContent = `Lịch sử tương tác với khách hàng · ${lead.name}`; const notes = Array.isArray(lead.notes) ? lead.notes : []; $('#note-history').innerHTML = notes.length ? notes.map((note, index) => `<div class="history-item"><div class="history-meta"><span>Lần ${index + 1}</span><span>${new Date(note.at).toLocaleString('vi-VN')}</span></div><p>${esc(note.text)}</p></div>`).join('') : '<p class="muted">Chưa có ghi chú tương tác.</p>'; $('#note-text').value = ''; const editable = isOwner(lead); $('#note-entry').hidden = !editable; $('#save-note').hidden = !editable; noteModal.classList.add('open'); }
  function reportRows() { const period = $('#report-period').value, selected = period === 'month' ? $('#report-month').value : $('#report-day').value; return leads.filter(lead => period === 'month' ? lead.foundAt?.startsWith(selected) : lead.foundAt === selected); }
  function renderReport() { const rows = reportRows(), status = value => rows.filter(lead => lead.status === value).length, category = value => rows.filter(lead => lead.category === value).length, result = value => rows.filter(lead => lead.result === value).length, card = (label, value) => `<article class="report-card"><span>${label}</span><b>${value}</b></article>`; $('#report-content').innerHTML = `<div class="report-section">Tiến độ data trong kỳ</div><div class="report-grid">${card('DATA MỚI', rows.length)}${card('ĐÃ GỬI KẾT BẠN', status('Đã gửi lời mời kết bạn'))}${card('ĐÃ KẾT BẠN', status('Đã kết bạn'))}${card('GỬI TIN CHƯA PHẢN HỒI', status('Đã gửi tin nhắn khách chưa phản hồi'))}${card('KHÁCH ĐÃ TƯƠNG TÁC', status('Khách đã tương tác'))}${card('ĐÃ TƯ VẤN DỊCH VỤ', status('Đã tư vấn dịch vụ'))}</div><div class="report-section">Phân loại khách hàng</div><div class="report-grid">${card('CỰC KỲ TIỀM NĂNG', category('Khách cực kỳ tiềm năng'))}${card('KHÁCH TIỀM NĂNG', category('Khách tiềm năng'))}${card('KHÔNG TIỀM NĂNG', category('Khách không tiềm năng'))}</div><div class="report-section">Kết quả</div><div class="report-grid">${card('ĐÃ CHỐT', result('Đã Chốt'))}${card('CHƯA CHỐT ĐƯỢC', result('Chưa Chốt Được'))}</div>`; }

  $('.searchbar input').addEventListener('input', renderRows);
  document.querySelectorAll('.searchbar select').forEach(element => element.addEventListener('change', renderRows));
  $('.filter').onclick = () => { $('.searchbar input').value = ''; document.querySelectorAll('.searchbar select').forEach((element, index) => element.selectedIndex = 0); activeTab = 'all'; render(); };
  $('.tabs').addEventListener('click', event => { const tab = event.target.closest('[data-tab]'); if (!tab) return; activeTab = tab.dataset.tab; render(); });
  $('#rows').addEventListener('change', event => { const selectElement = event.target.closest('select[data-field]'); if (!selectElement) return; const row = selectElement.closest('tr'), lead = leads.find(item => item.id === row.dataset.id); if (!lead) return; const patch = { status: lead.status || '', category: lead.category || '', result: lead.result || '', [selectElement.dataset.field]: selectElement.value }; updateLead(lead.id, patch).catch(error => alert(error.message)); });
  $('#rows').addEventListener('click', event => { const buttonElement = event.target.closest('.note'); if (!buttonElement) return; const lead = leads.find(item => item.id === buttonElement.closest('tr').dataset.id); if (lead) openNotes(lead); });
  $('.add').onclick = () => formModal.classList.add('open');
  formModal.querySelector('.close').onclick = formModal.querySelector('.cancel').onclick = () => formModal.classList.remove('open');
  formModal.addEventListener('click', event => { if (event.target === formModal) formModal.classList.remove('open'); });
  formModal.querySelector('form').onsubmit = async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)); if (values.link && !/^https?:\/\//i.test(values.link)) values.link = `https://${values.link}`; try { await api('POST', { action: 'create', record: values }); formModal.classList.remove('open'); event.target.reset(); await reload(); } catch (error) { alert(error.message); } };
  noteModal.querySelector('.close').onclick = noteModal.querySelector('.cancel').onclick = () => noteModal.classList.remove('open');
  noteModal.addEventListener('click', event => { if (event.target === noteModal) noteModal.classList.remove('open'); });
  $('#save-note').onclick = async () => { const text = $('#note-text').value.trim(); if (!text || !currentNote) return; try { await api('POST', { action: 'addNote', id: currentNote.id, text }); await reload(); openNotes(leads.find(lead => lead.id === currentNote.id)); } catch (error) { alert(error.message); } };
  const reportButton = document.createElement('button'); reportButton.className = 'crm-report'; reportButton.type = 'button'; reportButton.textContent = '▥ Báo cáo'; $('.searchbar').insertBefore(reportButton, $('.add'));
  const cleanupButton = document.createElement('button'); cleanupButton.className = 'crm-report'; cleanupButton.type = 'button'; cleanupButton.textContent = 'Xoá data test A TRUNG'; cleanupButton.hidden = true; $('.searchbar').insertBefore(cleanupButton, $('.add'));
  cleanupButton.onclick = async () => { if (!confirm('Xoá toàn bộ data CRM Mới do Sale A TRUNG tạo? Thao tác này không thể hoàn tác.')) return; try { const result = await api('POST', { action: 'deleteBySale', record: { sale: 'A TRUNG' } }); alert(`Đã xoá ${result.deleted} data test của A TRUNG.`); await reload(); } catch (error) { alert(error.message); } };
  reportButton.onclick = () => { const now = new Date(); $('#report-day').value = localIso(now); $('#report-month').value = localIso(now).slice(0, 7); renderReport(); reportModal.classList.add('open'); };
  $('#report-period').onchange = () => { const monthly = $('#report-period').value === 'month'; $('#report-day-wrap').hidden = monthly; $('#report-month-wrap').hidden = !monthly; renderReport(); };
  $('#report-day').onchange = $('#report-month').onchange = renderReport;
  reportModal.querySelector('.close').onclick = reportModal.querySelector('.cancel').onclick = () => reportModal.classList.remove('open');
  reportModal.addEventListener('click', event => { if (event.target === reportModal) reportModal.classList.remove('open'); });
  reload().then(() => { cleanupButton.hidden = user.role !== 'admin'; }).catch(error => { $('#rows').innerHTML = `<tr><td colspan="10" style="text-align:center;padding:42px;color:#d64f42">${esc(error.message)}</td></tr>`; });
})();
