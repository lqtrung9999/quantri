(() => {
  const STATUS = ['', 'Đã gửi lời mời kết bạn', 'Đã kết bạn', 'Đã gửi tin nhắn khách chưa phản hồi', 'Khách đã tương tác', 'Đã tư vấn dịch vụ'];
  const CATEGORY = ['', 'Khách cực kỳ tiềm năng', 'Khách tiềm năng', 'Khách không tiềm năng'];
  const RESULT = ['', 'Đã Chốt', 'Chưa Chốt Được'];
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const dateText = iso => { const [year, month, day] = String(iso || '').slice(0, 10).split('-'); return year ? `${day}/${month}/${year}` : '—'; };
  const initials = name => String(name || '').split(/\s+/).map(word => word[0]).slice(-2).join('').toUpperCase();
  const localIso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const saleTeam = sale => { const value = String(sale || '').trim().toLocaleUpperCase('vi-VN'); return value.startsWith('P5') || value.startsWith('TP5') ? 'P5' : value.startsWith('P8') || value.startsWith('TP8') ? 'P8' : ''; };
  let user, leads = [], activeTab = 'all', currentNote, currentProfile, createRequestId = '';
  $('#rows').innerHTML = '';

  const style = document.createElement('style');
  style.textContent = '.crm-report{background:#fff;border:1px solid #d9e1ec;border-radius:11px;color:#344054;padding:0 18px;font:700 15px inherit;cursor:pointer;white-space:nowrap}.crm-report:hover{background:#f5f8fc}.metric.archive-card{cursor:pointer}.metric.archive-card:hover,.metric.archive-card.active{border-color:#91a3bb;box-shadow:0 4px 16px #71829a1c}.customer-name{border:0;background:none;padding:0;color:#202938;font:800 15px inherit;cursor:pointer;text-align:left}.customer-name:hover{color:#ff7627;text-decoration:underline}.plain-status{display:inline-block;max-width:240px;white-space:normal;line-height:1.4}.new-modal{position:fixed;inset:0;background:#273243aa;z-index:99;display:none;place-items:center;padding:24px}.new-modal.open{display:grid}.new-modal .box{width:min(820px,calc(100vw - 36px));max-height:calc(100vh - 36px);display:flex;flex-direction:column;background:#fff;border:1px solid #dce5f0;border-radius:24px;box-shadow:0 25px 70px #0008;overflow:hidden}.new-modal form{min-height:0;display:flex;flex:1;flex-direction:column}.new-modal .head{padding:24px 30px;border-bottom:1px solid #e3eaf3;display:flex;justify-content:space-between;font-size:23px;font-weight:800}.new-modal .close{border:0;background:none;font-size:30px;cursor:pointer}.new-modal .body{min-height:0;flex:1;padding:24px 30px;overflow:auto}.new-modal .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px 22px}.new-modal label{display:grid;gap:8px;color:#687891;font-weight:600}.new-modal input,.new-modal select,.new-modal textarea{width:100%;border:1px solid #d5dfeb;border-radius:12px;padding:13px 15px;font:inherit;font-size:15px;color:#344054;background:#fff}.new-modal input[readonly]{background:#f3f6fa;color:#66758b}.new-modal textarea{height:105px;resize:vertical}.new-modal .full{grid-column:1/-1}.new-modal .foot{flex:none;padding:18px 30px;border-top:1px solid #e3eaf3;display:flex;justify-content:flex-end;gap:14px;background:#fff}.new-modal button.action{border:0;border-radius:12px;padding:13px 20px;background:#ff7627;color:#fff;font:800 16px inherit;cursor:pointer}.new-modal button.cancel{border:1px solid #d5dfeb;border-radius:12px;padding:13px 20px;background:#fff;color:#202938;font:800 16px inherit;cursor:pointer}.history{max-height:260px;overflow:auto}.history-item{padding:12px 0;border-bottom:1px solid #e3eaf3}.history-meta{display:flex;justify-content:space-between;gap:16px;color:#728099;font-size:13px;font-weight:700}.history-item p{margin:7px 0 0;line-height:1.5;white-space:normal}.profile-modal .box{width:min(1040px,calc(100vw - 36px))}.profile-history{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:24px}.history-panel{border:1px solid #e1e8f1;border-radius:14px;padding:16px}.history-panel h3{margin:0 0 8px}.change-values{color:#344054}.change-values del{color:#bd4b43}.change-values ins{color:#18845b;text-decoration:none}.timeline-item{border-left:3px solid #ff7627;padding:2px 0 16px 14px}.note-modal .box{width:min(760px,calc(100vw - 36px))}.note-modal .head{padding:20px 26px;font-size:20px}.note-modal .body{padding:20px 26px}.note-modal .history{max-height:300px}.note-modal .history-item{padding:15px 0}.note-modal .history-meta{font-size:14px}.note-modal .history-item p{margin:10px 0 0;font-size:16px;line-height:1.65}.note-modal #note-entry{margin-top:28px;gap:10px;font-size:15px}.note-modal #note-text{height:102px;font-size:16px;line-height:1.55}.note-modal .foot{padding:16px 26px}.report-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.report-card{border:1px solid #e0e7f0;border-radius:13px;padding:13px}.report-card b{display:block;font-size:23px;margin-top:6px}.report-card span{color:#728099;font-size:12px;font-weight:700}.report-section{margin:20px 0 10px;font-size:16px;font-weight:800}.sale-column-hidden th:nth-child(11),.sale-column-hidden td:nth-child(11){display:none}.summary-report-modal .box{width:min(1600px,calc(100vw - 36px))}.summary-report-modal .body{padding:22px 28px}.summary-report-title{margin:20px 0 12px;font-size:16px;font-weight:800}.summary-report-wrap{overflow:auto;border:1px solid #e0e7f0;border-radius:13px}.summary-report-wrap table{min-width:1500px}.summary-report-wrap th{height:auto;padding:13px 11px;text-align:center;line-height:1.35}.summary-report-wrap td{padding:13px 11px;text-align:center;font-variant-numeric:tabular-nums}.summary-report-wrap th:nth-child(1),.summary-report-wrap td:nth-child(1){position:sticky;left:0;background:#fff;text-align:left;z-index:1}.summary-report-wrap th:nth-child(1){background:#f8fafc;z-index:2}.summary-report-total td{background:#fff5e9;font-weight:800}@media(max-width:700px){.new-modal .grid,.report-grid,.profile-history{grid-template-columns:1fr}.new-modal .body{padding:20px}.new-modal .full{grid-column:auto}}';
  style.textContent += '.note.has-unread{background:#fff0f0;color:#d92d20;border:1px solid #f5aaa5;animation:crmPulse 1.8s infinite}.crm-reply-alert{border:1px solid #f5aaa5;border-radius:10px;background:#fff0f0;color:#d92d20;padding:10px 14px;font:700 13px inherit;cursor:pointer}.admin-reply{margin:12px 0 0 18px;padding:12px 14px;border-left:4px solid #d92d20;background:#fff5f4;border-radius:0 10px 10px 0}.admin-reply p{margin:4px 0}.reply-entry{display:grid;gap:8px;margin:14px 0 0 18px}.reply-entry textarea{height:76px}.reply-entry button{justify-self:end;border:0;border-radius:9px;background:#202938;color:#fff;padding:9px 14px;font:700 13px inherit;cursor:pointer}@keyframes crmPulse{50%{box-shadow:0 0 0 4px #f0443820}}';
  document.head.append(style);

  const replyAlert = document.createElement('button');
  replyAlert.id = 'crm-reply-alert'; replyAlert.className = 'crm-reply-alert'; replyAlert.hidden = true;
  document.querySelector('.user').prepend(replyAlert);

  const formModal = document.createElement('div');
  formModal.className = 'new-modal';
  formModal.innerHTML = `<div class="box"><div class="head">Thêm khách hàng tiềm năng<button class="close">×</button></div><form><div class="body grid"><label>Tên khách hàng<input name="name" required placeholder="VD: Nguyễn Thị Lan"></label><label>Số điện thoại<input name="phone" placeholder="09xx xxx xxx"></label><label>Nguồn<select name="source"><option>Facebook</option><option>Google</option><option>Shopee</option><option>TikTok</option><option>Khác</option></select></label><label>Mặt hàng kinh doanh<input name="product" placeholder="VD: Thời trang nữ"></label><label class="full">Link FB / Shopee / TikTok<input name="link" placeholder="https://facebook.com/... hoặc https://shopee.vn/..."></label><label class="full">Ghi chú ban đầu<textarea name="note" placeholder="Nguồn tìm thấy, mặt hàng đang kinh doanh và thông tin cần lưu ý…"></textarea></label></div><div class="foot"><button type="button" class="cancel">Hủy</button><button class="action">Lưu khách hàng</button></div></form></div>`;
  document.body.append(formModal);

  const noteModal = document.createElement('div');
  noteModal.className = 'new-modal note-modal';
  noteModal.innerHTML = `<div class="box"><div class="head"><span id="note-title">Lịch sử tương tác</span><button class="close">×</button></div><div class="body"><div id="note-history" class="history"></div><label id="note-entry">Thêm ghi chú sau lần tương tác<textarea id="note-text" placeholder="VD: Khách đang nhập đồ gia dụng, khoảng 300kg/tháng; hẹn gửi bảng giá vào thứ Sáu…"></textarea></label></div><div class="foot"><button class="cancel">Đóng</button><button class="action" id="save-note">＋ Lưu ghi chú</button></div></div>`;
  document.body.append(noteModal);

  const profileModal = document.createElement('div');
  profileModal.className = 'new-modal profile-modal';
  profileModal.innerHTML = `<div class="box"><div class="head"><span>Hồ sơ khách hàng</span><button class="close" type="button">×</button></div><form><div class="body"><div class="grid"><label>Tên khách hàng (chỉ đọc)<input name="name" readonly></label><label>Số điện thoại<input name="phone" maxlength="50"></label><label>Nguồn<input name="source" maxlength="50"></label><label>Mặt hàng<input name="product" maxlength="200"></label><label class="full">Link<input name="link" maxlength="1000"></label><label>Trạng thái Zalo<select name="status">${STATUS.map(value => `<option value="${esc(value)}">${esc(value || 'Chưa cập nhật')}</option>`).join('')}</select></label><label>Phân loại KH<select name="category">${CATEGORY.map(value => `<option value="${esc(value)}">${esc(value || 'Chưa phân loại')}</option>`).join('')}</select></label><label>Kết quả<select name="result">${RESULT.map(value => `<option value="${esc(value)}">${esc(value || 'Chưa có kết quả')}</option>`).join('')}</select></label><label class="full" id="profile-note-wrap">Ghi chú mới<textarea name="note" placeholder="Nội dung mới sẽ được nối vào lịch sử, không ghi đè ghi chú cũ"></textarea></label></div><div class="profile-history"><section class="history-panel"><h3>Lịch sử thay đổi</h3><div id="change-history" class="history"></div></section><section class="history-panel"><h3>Timeline trạng thái Zalo</h3><div id="zalo-timeline" class="history"></div></section></div></div><div class="foot"><button type="button" class="cancel">Đóng</button><button class="action" id="save-profile">Cập nhật</button></div></form></div>`;
  document.body.append(profileModal);

  const reportModal = document.createElement('div');
  reportModal.className = 'new-modal';
  reportModal.innerHTML = `<div class="box"><div class="head">Báo cáo hoạt động Sale<button class="close">×</button></div><div class="body"><div class="grid"><label>Xem theo<select id="report-period"><option value="day">Ngày</option><option value="month">Tháng</option></select></label><label id="report-day-wrap">Chọn ngày<input id="report-day" type="date"></label><label id="report-month-wrap" hidden>Chọn tháng<input id="report-month" type="month"></label></div><div id="report-content"></div></div><div class="foot"><button class="cancel">Đóng</button></div></div>`;
  document.body.append(reportModal);

  const summaryReportModal = document.createElement('div');
  summaryReportModal.className = 'new-modal summary-report-modal';
  summaryReportModal.innerHTML = `<div class="box"><div class="head">Báo cáo tổng hoạt động Sale<button class="close">×</button></div><div class="body"><div class="grid"><label id="summary-team-wrap" hidden>Phạm vi xem<select id="summary-team"><option value="all">Toàn công ty</option><option value="P5">Phòng 5</option><option value="P8">Phòng 8</option></select></label><label>Xem theo<select id="summary-period"><option value="day">Ngày</option><option value="month">Tháng</option></select></label><label id="summary-day-wrap">Chọn ngày<input id="summary-day" type="date"></label><label id="summary-month-wrap" hidden>Chọn tháng<input id="summary-month" type="month"></label></div><div id="summary-report-content"></div></div><div class="foot"><button class="cancel">Đóng</button></div></div>`;
  document.body.append(summaryReportModal);

  const api = async (method = 'GET', body) => { const response = await fetch('/api/crm-new/leads', body ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Không thể cập nhật CRM Mới.'); return data; };
  const isOwner = lead => user?.role === 'sale' && String(lead.sale || '').trim().toLocaleLowerCase('vi-VN') === String(user.sale || '').trim().toLocaleLowerCase('vi-VN');
  const unreadReplies = lead => (lead.notes || []).reduce((count, note) => count + (note.replies || []).filter(reply => !reply.readAt).length, 0);
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
      const notes = Array.isArray(lead.notes) ? lead.notes.length : 0, unread = isOwner(lead) ? unreadReplies(lead) : 0;
      return `<tr data-id="${esc(lead.id)}"><td>${dateText(lead.foundAt)}</td><td class="muted">${index + 1}</td><td><button class="customer-name" type="button">${esc(lead.name)}</button><div class="phone">${esc(lead.phone || '—')}</div></td><td><i class="dot ${sourceClass(lead.source)}"></i>${esc(lead.source)}</td><td>${lead.link ? `<a class="link" href="${esc(lead.link)}" target="_blank" rel="noopener noreferrer">↗ Mở link</a>` : '<span class="muted">Chưa có link</span>'}</td><td>${esc(lead.product || 'Chưa cập nhật')}</td><td><span class="plain-status">${esc(lead.status || 'Chưa cập nhật')}</span></td><td><span class="plain-status">${esc(lead.category || 'Chưa phân loại')}</span></td><td><button class="note ${unread ? 'has-unread' : ''}" type="button">${unread ? `⚠ ${unread} phản hồi mới` : `✎ ${notes} ghi chú`}</button></td><td><span class="plain-status">${esc(lead.result || 'Chưa có kết quả')}</span></td><td><div class="owner"><span class="small-avatar">${esc(initials(lead.sale))}</span>${esc(lead.sale)}</div></td></tr>`;
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
  function renderReplyAlert() { const count = user?.role === 'sale' ? leads.reduce((total, lead) => total + unreadReplies(lead), 0) : 0; replyAlert.hidden = !count; replyAlert.textContent = `🔔 ${count} phản hồi mới từ Admin`; }
  function render() { renderFilters(); renderTabs(); renderRows(); renderMetrics(); renderReplyAlert(); }
  async function reload() { const data = await api(); user = data.user; leads = data.rows || []; const name = user.name || user.sale || 'Sales'; $('#user').textContent = `${name} · ${user.role === 'sale' ? 'Sales' : user.role === 'accountant' ? 'Kế toán' : 'Admin'}`; $('#avatar').textContent = initials(name); document.querySelectorAll('thead th')[7].textContent = 'PHÂN LOẠI KH'; document.querySelectorAll('thead th')[9].textContent = 'KẾT QUẢ'; document.querySelectorAll('thead th')[10].textContent = 'SALE'; $('.add').hidden = user.role !== 'sale'; render(); }
  async function updateLead(id, patch) { const result = await api('POST', { action: 'update', record: { id, ...patch } }); const index = leads.findIndex(lead => lead.id === id); if (index >= 0) leads[index] = result.record; render(); return result.record; }
  const fullDate = iso => iso ? new Date(iso).toLocaleString('vi-VN') : '—';
  function openProfile(lead) {
    currentProfile = lead;
    const form = profileModal.querySelector('form'), editable = isOwner(lead);
    ['name', 'phone', 'source', 'product', 'link', 'status', 'category', 'result'].forEach(field => { form.elements[field].value = lead[field] || ''; form.elements[field].disabled = field !== 'name' && !editable; });
    form.elements.note.value = ''; form.elements.note.disabled = !editable;
    $('#profile-note-wrap').hidden = !editable; $('#save-profile').hidden = !editable;
    const history = Array.isArray(lead.history) ? [...lead.history].reverse() : [];
    $('#change-history').innerHTML = history.length ? history.map(change => `<div class="history-item"><div class="history-meta"><span>${esc(change.label || change.field)}</span><span>${esc(fullDate(change.at))}</span></div><p>${esc(change.author || 'Hệ thống')} · <span class="change-values"><del>${esc(change.from || 'Trống')}</del> → <ins>${esc(change.to || 'Trống')}</ins></span></p></div>`).join('') : '<p class="muted">Hồ sơ cũ chưa có nhật ký thay đổi.</p>';
    const timeline = Array.isArray(lead.zaloTimeline) && lead.zaloTimeline.length ? lead.zaloTimeline : [{ label: lead.status || 'Chưa cập nhật', author: 'Hệ thống', at: lead.createdAt }];
    $('#zalo-timeline').innerHTML = timeline.map(item => `<div class="timeline-item"><b>${esc(item.label || item.status || 'Chưa cập nhật')}</b><p class="muted">${esc(fullDate(item.at))} · ${esc(item.author || 'Hệ thống')}</p></div>`).join('');
    profileModal.classList.add('open');
  }
  function openNotes(lead) {
    currentNote = lead; $('#note-title').textContent = `Lịch sử tương tác với khách hàng · ${lead.name}`;
    const notes = Array.isArray(lead.notes) ? lead.notes : [], canReply = user.role === 'admin';
    $('#note-history').innerHTML = notes.length ? notes.map((note, index) => `<div class="history-item" data-note-id="${esc(note.id)}"><div class="history-meta"><span>Lần ${index + 1} · ${esc(note.author || lead.sale)}</span><span>${new Date(note.at).toLocaleString('vi-VN')}</span></div><p>${esc(note.text)}</p>${(note.replies || []).map(reply => `<div class="admin-reply"><b>Phản hồi từ ${esc(reply.author || 'Admin')}</b><p>${esc(reply.text)}</p><span class="muted">${new Date(reply.at).toLocaleString('vi-VN')}</span></div>`).join('')}${canReply ? `<label class="reply-entry">Phản hồi ghi chú này<textarea placeholder="Nhập phản hồi gửi đến Sale…"></textarea><button type="button" data-reply-note="${esc(note.id)}">Gửi phản hồi</button></label>` : ''}</div>`).join('') : '<p class="muted">Chưa có ghi chú tương tác.</p>';
    $('#note-text').value = ''; const editable = isOwner(lead); $('#note-entry').hidden = !editable; $('#save-note').hidden = !editable; noteModal.classList.add('open');
    if (editable && unreadReplies(lead)) api('POST', { action: 'markRepliesRead', id: lead.id }).then(result => { const index = leads.findIndex(item => item.id === lead.id); if (index >= 0) leads[index] = result.record; currentNote = result.record; render(); }).catch(error => alert(error.message));
  }
  function reportRows() { const period = $('#report-period').value, selected = period === 'month' ? $('#report-month').value : $('#report-day').value; return leads.filter(lead => period === 'month' ? lead.foundAt?.startsWith(selected) : lead.foundAt === selected); }
  function renderReport() { const rows = reportRows(), status = value => rows.filter(lead => lead.status === value).length, category = value => rows.filter(lead => lead.category === value).length, result = value => rows.filter(lead => lead.result === value).length, card = (label, value) => `<article class="report-card"><span>${label}</span><b>${value}</b></article>`; $('#report-content').innerHTML = `<div class="report-section">Tiến độ data trong kỳ</div><div class="report-grid">${card('DATA MỚI', rows.length)}${card('ĐÃ GỬI KẾT BẠN', status('Đã gửi lời mời kết bạn'))}${card('ĐÃ KẾT BẠN', status('Đã kết bạn'))}${card('GỬI TIN CHƯA PHẢN HỒI', status('Đã gửi tin nhắn khách chưa phản hồi'))}${card('KHÁCH ĐÃ TƯƠNG TÁC', status('Khách đã tương tác'))}${card('ĐÃ TƯ VẤN DỊCH VỤ', status('Đã tư vấn dịch vụ'))}</div><div class="report-section">Phân loại khách hàng</div><div class="report-grid">${card('CỰC KỲ TIỀM NĂNG', category('Khách cực kỳ tiềm năng'))}${card('KHÁCH TIỀM NĂNG', category('Khách tiềm năng'))}${card('KHÔNG TIỀM NĂNG', category('Khách không tiềm năng'))}</div><div class="report-section">Kết quả</div><div class="report-grid">${card('ĐÃ CHỐT', result('Đã Chốt'))}${card('CHƯA CHỐT ĐƯỢC', result('Chưa Chốt Được'))}</div>`; }
  function summaryReportRows() { const period = $('#summary-period').value, selected = period === 'month' ? $('#summary-month').value : $('#summary-day').value, team = user.role === 'admin' ? $('#summary-team').value : user.team; return leads.filter(lead => (team === 'all' || saleTeam(lead.sale) === team) && (period === 'month' ? lead.foundAt?.startsWith(selected) : lead.foundAt === selected)); }
  function renderSummaryReport() {
    const reportRows = summaryReportRows(), status = STATUS.slice(1), sales = new Map();
    reportRows.forEach(lead => {
      const sale = String(lead.sale || 'Chưa phân công').trim() || 'Chưa phân công';
      const row = sales.get(sale) || { sale, data: 0, status: Object.fromEntries(status.map(value => [value, 0])), potential: 0, nonPotential: 0, closed: 0, notClosed: 0 };
      row.data++;
      if (status.includes(lead.status)) row.status[lead.status]++;
      if (['Khách tiềm năng', 'Khách cực kỳ tiềm năng'].includes(lead.category)) row.potential++;
      if (lead.category === 'Khách không tiềm năng') row.nonPotential++;
      if (lead.result === 'Đã Chốt') row.closed++;
      if (lead.result === 'Chưa Chốt Được') row.notClosed++;
      sales.set(sale, row);
    });
    const rows = [...sales.values()].sort((left, right) => left.sale.localeCompare(right.sale, 'vi'));
    const total = rows.reduce((summary, row) => {
      summary.data += row.data; status.forEach(value => { summary.status[value] += row.status[value]; }); summary.potential += row.potential; summary.nonPotential += row.nonPotential; summary.closed += row.closed; summary.notClosed += row.notClosed; return summary;
    }, { sale: 'TỔNG', data: 0, status: Object.fromEntries(status.map(value => [value, 0])), potential: 0, nonPotential: 0, closed: 0, notClosed: 0 });
    const cell = row => `<tr${row.sale === 'TỔNG' ? ' class="summary-report-total"' : ''}><td>${esc(row.sale)}</td><td>${row.data}</td>${status.map(value => `<td>${row.status[value]}</td>`).join('')}<td>${row.potential}</td><td>${row.nonPotential}</td><td>${row.closed}</td><td>${row.notClosed}</td></tr>`;
    const chosenTeam = user.role === 'admin' ? $('#summary-team').value : user.team;
    const scope = chosenTeam === 'all' ? 'toàn công ty' : `Phòng ${chosenTeam.slice(1)}`;
    $('#summary-report-content').innerHTML = `<div class="summary-report-title">${esc(scope)} · ${reportRows.length} data phát sinh trong kỳ</div><div class="summary-report-wrap"><table><thead><tr><th>SALE</th><th>DATA MỚI</th><th>ĐÃ GỬI LỜI MỜI KẾT BẠN</th><th>ĐÃ KẾT BẠN</th><th>ĐÃ GỬI TIN NHẮN<br>CHƯA PHẢN HỒI</th><th>KHÁCH ĐÃ<br>TƯƠNG TÁC</th><th>ĐÃ TƯ VẤN<br>DỊCH VỤ</th><th>KHÁCH HÀNG<br>TIỀM NĂNG</th><th>KHÔNG<br>TIỀM NĂNG</th><th>ĐÃ CHỐT</th><th>CHƯA CHỐT<br>ĐƯỢC</th></tr></thead><tbody>${cell(total)}${rows.map(cell).join('') || `<tr><td colspan="11">Chưa có data phát sinh trong kỳ được chọn.</td></tr>`}</tbody></table></div>`;
  }

  $('.searchbar input').addEventListener('input', renderRows);
  document.querySelectorAll('.searchbar select').forEach(element => element.addEventListener('change', renderRows));
  $('.filter').onclick = () => { $('.searchbar input').value = ''; document.querySelectorAll('.searchbar select').forEach((element, index) => element.selectedIndex = 0); activeTab = 'all'; render(); };
  $('.tabs').addEventListener('click', event => { const tab = event.target.closest('[data-tab]'); if (!tab) return; activeTab = tab.dataset.tab; render(); });
  $('#rows').addEventListener('click', event => { const row = event.target.closest('tr[data-id]'), lead = row && leads.find(item => item.id === row.dataset.id); if (!lead) return; if (event.target.closest('.customer-name')) openProfile(lead); else if (event.target.closest('.note')) openNotes(lead); });
  $('.add').onclick = () => { createRequestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; formModal.classList.add('open'); };
  formModal.querySelector('.close').onclick = formModal.querySelector('.cancel').onclick = () => formModal.classList.remove('open');
  formModal.addEventListener('click', event => { if (event.target === formModal) formModal.classList.remove('open'); });
  formModal.querySelector('form').onsubmit = async event => { event.preventDefault(); const form = event.currentTarget, button = form.querySelector('.action'); if (form.dataset.saving === '1') return; form.dataset.saving = '1'; button.disabled = true; button.textContent = 'Đang lưu…'; const values = { ...Object.fromEntries(new FormData(form)), requestId: createRequestId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`) }; if (values.link && !/^https?:\/\//i.test(values.link)) values.link = `https://${values.link}`; try { const result = await api('POST', { action: 'create', record: values }); formModal.classList.remove('open'); form.reset(); createRequestId = ''; leads.unshift(result.record); render(); } catch (error) { alert(error.message); } finally { delete form.dataset.saving; button.disabled = false; button.textContent = 'Lưu khách hàng'; } };
  noteModal.querySelector('.close').onclick = noteModal.querySelector('.cancel').onclick = () => noteModal.classList.remove('open');
  noteModal.addEventListener('click', event => { if (event.target === noteModal) noteModal.classList.remove('open'); });
  $('#save-note').onclick = async () => { const text = $('#note-text').value.trim(); if (!text || !currentNote) return; try { await api('POST', { action: 'addNote', id: currentNote.id, text }); await reload(); openNotes(leads.find(lead => lead.id === currentNote.id)); } catch (error) { alert(error.message); } };
  $('#note-history').addEventListener('click', async event => { const button = event.target.closest('[data-reply-note]'); if (!button || !currentNote || user.role !== 'admin') return; const entry = button.closest('.reply-entry'), text = entry.querySelector('textarea').value.trim(); if (!text) return; button.disabled = true; button.textContent = 'Đang gửi…'; try { const result = await api('POST', { action: 'replyNote', id: currentNote.id, record: { noteId: button.dataset.replyNote, text } }); const index = leads.findIndex(lead => lead.id === currentNote.id); if (index >= 0) leads[index] = result.record; openNotes(result.record); render(); } catch (error) { alert(error.message); button.disabled = false; button.textContent = 'Gửi phản hồi'; } });
  replyAlert.onclick = () => { const lead = leads.find(item => unreadReplies(item)); if (lead) openNotes(lead); };
  profileModal.querySelector('.close').onclick = profileModal.querySelector('.cancel').onclick = () => profileModal.classList.remove('open');
  profileModal.addEventListener('click', event => { if (event.target === profileModal) profileModal.classList.remove('open'); });
  profileModal.querySelector('form').onsubmit = async event => {
    event.preventDefault(); if (!currentProfile || !isOwner(currentProfile)) return;
    const values = Object.fromEntries(new FormData(event.target));
    if (values.link && !/^https?:\/\//i.test(values.link)) values.link = `https://${values.link}`;
    delete values.name;
    const button = $('#save-profile'); button.disabled = true; button.textContent = 'Đang lưu…';
    try { const saved = await updateLead(currentProfile.id, values); currentProfile = saved; openProfile(saved); }
    catch (error) { alert(error.message); }
    finally { button.disabled = false; button.textContent = 'Cập nhật'; }
  };
  const reportButton = document.createElement('button'); reportButton.className = 'crm-report'; reportButton.type = 'button'; reportButton.textContent = '▥ Báo cáo'; $('.searchbar').insertBefore(reportButton, $('.add'));
  const summaryReportButton = document.createElement('button'); summaryReportButton.className = 'crm-report'; summaryReportButton.type = 'button'; summaryReportButton.textContent = '▦ Báo cáo tổng'; summaryReportButton.hidden = true; $('.searchbar').insertBefore(summaryReportButton, $('.add'));
  reportButton.onclick = () => { const now = new Date(); $('#report-day').value = localIso(now); $('#report-month').value = localIso(now).slice(0, 7); renderReport(); reportModal.classList.add('open'); };
  summaryReportButton.onclick = () => { const now = new Date(); $('#summary-day').value = localIso(now); $('#summary-month').value = localIso(now).slice(0, 7); renderSummaryReport(); summaryReportModal.classList.add('open'); };
  $('#report-period').onchange = () => { const monthly = $('#report-period').value === 'month'; $('#report-day-wrap').hidden = monthly; $('#report-month-wrap').hidden = !monthly; renderReport(); };
  $('#report-day').onchange = $('#report-month').onchange = renderReport;
  reportModal.querySelector('.close').onclick = reportModal.querySelector('.cancel').onclick = () => reportModal.classList.remove('open');
  reportModal.addEventListener('click', event => { if (event.target === reportModal) reportModal.classList.remove('open'); });
  $('#summary-period').onchange = () => { const monthly = $('#summary-period').value === 'month'; $('#summary-day-wrap').hidden = monthly; $('#summary-month-wrap').hidden = !monthly; renderSummaryReport(); };
  $('#summary-team').onchange = renderSummaryReport;
  $('#summary-day').onchange = $('#summary-month').onchange = renderSummaryReport;
  summaryReportModal.querySelector('.close').onclick = summaryReportModal.querySelector('.cancel').onclick = () => summaryReportModal.classList.remove('open');
  summaryReportModal.addEventListener('click', event => { if (event.target === summaryReportModal) summaryReportModal.classList.remove('open'); });
  reload().then(() => { summaryReportButton.hidden = !(user.role === 'admin' || user.team); $('#summary-team-wrap').hidden = user.role !== 'admin'; }).catch(error => { $('#rows').innerHTML = `<tr><td colspan="10" style="text-align:center;padding:42px;color:#d64f42">${esc(error.message)}</td></tr>`; });
})();
