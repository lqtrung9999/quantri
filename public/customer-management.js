(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const money = value => `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))} đ`;
  const initials = name => String(name || '').split(/\s+/).map(word => word[0]).slice(-2).join('').toUpperCase();
  const isoToday = () => new Date().toISOString().slice(0, 10);
  let user, customers = [], selected;
  const api = async (method = 'GET', body) => { const response = await fetch('/api/customer-management', body ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Không thể cập nhật khách hàng.'); return data; };
  const currentPrice = customer => (customer.priceVersions || []).find(version => version.isCurrent) || (customer.priceVersions || [])[0] || {};
  const open = element => element.classList.add('open'); const close = element => element.classList.remove('open');
  function filtered() { const term = $('#search').value.trim().toLocaleLowerCase('vi-VN'), channel = $('#channel').value, issues = $('#issueFilter').value; return customers.filter(customer => { const groups = (customer.groups || []).map(group => `${group.name} ${group.link}`).join(' '), hasIssue = (customer.issues || []).length > 0, haystack = `${customer.name} ${customer.code} ${customer.phone} ${groups}`.toLocaleLowerCase('vi-VN'); const issueMatches = !issues || (issues === 'issue' ? hasIssue : !hasIssue); return (!term || haystack.includes(term)) && (!channel || customer.channel === channel) && issueMatches; }); }
  function renderKpis() { const active = customers.filter(customer => customer.status === 'Đang hoạt động'), groups = customers.reduce((total, customer) => total + (customer.groups || []).length, 0), issues = customers.reduce((total, customer) => total + (customer.issues || []).length, 0), revenue = customers.reduce((total, customer) => total + Number(customer.lifetimeRevenue || 0), 0); $('#activeCount').textContent = active.length; $('#groups').textContent = groups; $('#issues').textContent = issues; $('#revenue').textContent = money(revenue); }
  function render() { renderKpis(); const list = filtered(); $('#rows').innerHTML = list.map((customer, index) => { const price = currentPrice(customer), issues = (customer.issues || []).length, debt = Number(customer.outstandingDebt || 0); return `<tr data-id="${esc(customer.id)}"><td>${index + 1}</td><td><button class="name" data-detail>${esc(customer.name)}</button><div class="sub">${esc(customer.phone)}</div></td><td><b>${esc(customer.code)}</b></td><td><select class="status ${customer.status === 'Đã dừng gửi hàng' ? 'stopped' : ''}" data-status><option ${customer.status === 'Đang hoạt động' ? 'selected' : ''}>Đang hoạt động</option><option ${customer.status === 'Đã dừng gửi hàng' ? 'selected' : ''}>Đã dừng gửi hàng</option></select></td><td><span class="channel">${esc(customer.channel)}</span></td><td>${(customer.groups || []).length} nhóm</td><td><div class="price">${esc(price.freightPrice || 'Chưa cập nhật')}</div><button class="price-btn" data-price>↻ Cập nhật giá</button></td><td>${new Intl.NumberFormat('vi-VN').format(Number(customer.orderCount || 0))} đơn</td><td><b>${money(customer.lifetimeRevenue)}</b></td><td><b class="${debt > 0 ? 'debt' : ''}">${money(debt)}</b></td><td><button class="note-btn" data-issue>✎ ${issues} Note</button></td><td>${esc(customer.salesOwner || 'Chưa phân công')}</td></tr>`; }).join('') || '<tr><td colspan="12" class="empty">Chưa có khách hàng sử dụng dịch vụ. Bấm “Thêm khách hàng” để bắt đầu.</td></tr>'; }
  async function reload() { const data = await api(); user = data.user; customers = data.rows || []; const name = user.name || 'Quản trị viên'; $('#user').textContent = `${name} · Admin`; $('#avatar').textContent = initials(name); render(); }
  function detail(customer) {
    selected = customer;
    const versions = customer.priceVersions || [];
    const groups = customer.groups || [];
    const payments = customer.payments || [];
    const issues = customer.issues || [];
    $('#detailTitle').textContent = 'Chi tiết · ' + customer.name;

    $('#summary').innerHTML = [
      ['Số điện thoại', esc(customer.phone || 'Chưa cập nhật')],
      ['Kênh / số nhóm', esc(customer.channel || '—') + ' · ' + groups.length + ' nhóm'],
      ['Doanh số / công nợ', money(customer.lifetimeRevenue) + ' · ' + money(customer.outstandingDebt)],
      ['Sale phụ trách', esc(customer.salesOwner || 'Chưa phân công')]
    ].map(([label, value]) => `<div class="box"><span>${label}</span><b>${value}</b></div>`).join('');

    const priceRows = versions.map(version => `<div class="history-row"><span>${esc(version.effectiveDate || '—')}</span><b>${esc(version.freightPrice || 'Chưa cập nhật')}</b><span>${esc(version.fees || 'Không thu phí')}</span><span class="${version.isCurrent ? 'current' : ''}">${version.isCurrent ? 'Đang áp dụng' : 'Lịch sử'}</span></div>`).join('');
    $('#pane-price').innerHTML = `<div class="pane-title"><span>Lịch sử giá cước và các loại phí đã chốt</span><button class="action primary" id="openPrice">＋ Cập nhật giá cước</button></div><div class="history-row head"><span>Ngày áp dụng</span><span>Giá cước chốt</span><span>Các loại phí</span><span>Trạng thái</span></div>${priceRows || '<p class="sub">Chưa có lịch sử giá cước.</p>'}`;

    const groupRows = groups.map((group, index) => {
      const link = group.link ? `<a href="${esc(group.link)}" target="_blank" rel="noopener">Mở liên kết</a>` : 'Chưa có liên kết';
      return `<div class="history-row"><span>Nhóm ${index + 1}</span><b>${esc(group.name || 'Chưa đặt tên')}</b><span>${link}</span><span>${esc(group.channel || customer.channel || '—')}</span></div>`;
    }).join('');
    $('#pane-groups').innerHTML = `<div class="pane-title"><span>${groups.length} nhóm đang làm việc</span></div><div class="history-row head"><span>STT</span><span>Tên nhóm</span><span>Liên kết</span><span>Kênh</span></div>${groupRows || '<p class="sub">Chưa có nhóm làm việc.</p>'}`;

    $('#pane-orders').innerHTML = `<div class="pane-title"><span>Dữ liệu đồng bộ từ hệ thống đơn hàng</span></div><div class="history-row"><span>Tổng đơn hàng</span><b>${Number(customer.orderCount || 0).toLocaleString('vi-VN')} đơn</b><span>Doanh số lũy kế</span><b>${money(customer.lifetimeRevenue)}</b></div><p class="sub">Lịch sử chi tiết đơn hàng sẽ được đồng bộ khi kết nối nguồn dữ liệu vận hành.</p>`;

    const paymentRows = payments.map(payment => `<div class="history-row"><span>${esc(payment.date || '—')}</span><b>${money(payment.amount)}</b><span>${esc(payment.method || '—')}${payment.code ? '<br><small>' + esc(payment.code) + '</small>' : ''}</span><span>${esc(payment.confirmedBy || '—')}</span></div>`).join('');
    const paymentContent = paymentRows
      ? '<div class="history-row head"><span>Ngày thanh toán</span><span>Số tiền</span><span>Hình thức / mã GD</span><span>Xác nhận</span></div>' + paymentRows
      : '<p class="sub">Chưa có lần thanh toán nào được ghi nhận.</p>';
    $('#pane-payments').innerHTML = `<div class="pane-title"><span>${payments.length} lần thanh toán · Công nợ hiện tại: ${money(customer.outstandingDebt)}</span></div>${paymentContent}`;

    const issueRows = issues.map((issue, index) => `<div class="history-row"><span>Vấn đề ${index + 1}</span><b>${esc(issue.title || 'Vấn đề phát sinh')}</b><span>${esc(issue.note || '—')}</span><span>${esc(issue.createdAt || '—')}</span></div>`).join('');
    $('#pane-issues').innerHTML = `<div class="pane-title"><span>${issues.length} Note vấn đề phát sinh</span></div><div class="history-row head"><span>#</span><span>Tiêu đề</span><span>Nội dung</span><span>Thời gian</span></div>${issueRows || '<p class="sub">Chưa có Note vấn đề phát sinh.</p>'}`;

    document.querySelectorAll('.tabs .tab,.pane').forEach(element => element.classList.remove('active'));
    document.querySelector('[data-pane="price"]').classList.add('active');
    $('#pane-price').classList.add('active');
    $('#openPrice').onclick = () => {
      close($('#detailModal'));
      $('#priceForm').reset();
      $('#priceCustomerName').textContent = customer.name;
      open($('#priceModal'));
    };
    open($('#detailModal'));
  }
  function showIssues(customer) {
    selected = customer;
    const issues = customer.issues || [];
    $('#issueTitle').textContent = 'Vấn đề phát sinh · ' + customer.name;
    $('#issueList').innerHTML = issues.length
      ? issues.map((issue, index) => `<div class="note"><b>Vấn đề ${index + 1} · ${esc(issue.title || 'Chưa đặt tiêu đề')}</b><p>${esc(issue.note || '—')}</p><small>${esc(issue.createdAt || '')}</small></div>`).join('')
      : '<p class="sub">Chưa có Note vấn đề phát sinh.</p>';
    $('#issueForm').reset();
    open($('#issueModal'));
  }
  $('#search').oninput = $('#channel').onchange = $('#issueFilter').onchange = render;
  $('#add').onclick = () => { $('#form').reset(); open($('#formModal')); };
  document.querySelectorAll('.modal').forEach(modal => { modal.addEventListener('click', event => { if (event.target === modal) close(modal); }); modal.querySelectorAll('.close,.cancel').forEach(button => button.onclick = () => close(modal)); });
  $('#rows').onclick = event => { const row = event.target.closest('tr[data-id]'); if (!row) return; const customer = customers.find(item => item.id === row.dataset.id); if (!customer) return; if (event.target.closest('[data-detail]')) detail(customer); if (event.target.closest('[data-price]')) { selected = customer; $('#priceForm').reset(); $('#priceForm').freightPrice.value = currentPrice(customer).freightPrice || ''; $('#priceForm').fees.value = currentPrice(customer).fees || ''; $('#priceForm').effectiveDate.value = isoToday(); open($('#priceModal')); } if (event.target.closest('[data-issue]')) showIssues(customer); };
  $('#rows').onchange = event => { const row = event.target.closest('tr[data-id]'), select = event.target.closest('[data-status]'); if (!row || !select) return; api('POST', { action: 'status', id: row.dataset.id, record: { status: select.value } }).then(reload).catch(error => alert(error.message)); };
  $('#form').onsubmit = async event => { event.preventDefault(); const value = Object.fromEntries(new FormData(event.target)), groups = String(value.groups || '').split('\n').map(line => { const [name, link] = line.split('|'); return { name: String(name || '').trim(), link: String(link || '').trim() }; }).filter(group => group.name); try { await api('POST', { action: 'create', record: { ...value, groups } }); close($('#formModal')); await reload(); } catch (error) { alert(error.message); } };
  $('#priceForm').onsubmit = async event => { event.preventDefault(); if (!selected) return; try { await api('POST', { action: 'addPrice', id: selected.id, record: Object.fromEntries(new FormData(event.target)) }); close($('#priceModal')); await reload(); detail(customers.find(customer => customer.id === selected.id)); } catch (error) { alert(error.message); } };
  $('#issueForm').onsubmit = async event => { event.preventDefault(); if (!selected) return; try { await api('POST', { action: 'addIssue', id: selected.id, record: Object.fromEntries(new FormData(event.target)) }); close($('#issueModal')); await reload(); detail(customers.find(customer => customer.id === selected.id)); } catch (error) { alert(error.message); } };
  document.querySelectorAll('.tabs .tab').forEach(button => button.onclick = () => { document.querySelectorAll('.tabs .tab,.pane').forEach(element => element.classList.remove('active')); button.classList.add('active'); $(`#pane-${button.dataset.pane}`).classList.add('active'); });
  reload().catch(error => { $('#rows').innerHTML = `<tr><td colspan="12" class="empty">${esc(error.message)}</td></tr>`; });
})();
