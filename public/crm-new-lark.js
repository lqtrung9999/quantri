(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const when = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
  const endpoint = '/api/crm-new/lark-report';
  let state, busy = false, refreshing = false, authorized = true;
  const message = (text, error = false) => { $('#message').hidden = false; $('#message').textContent = text; $('#message').classList.toggle('error', error); };
  async function api(path = '', input) {
    const response = await fetch(endpoint + path, input ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {});
    const data = await response.json();
    if (!response.ok) {
      if ([401, 403].includes(response.status)) authorized = false;
      throw new Error(data.error || 'Không thể xử lý báo cáo Lark.');
    }
    return data;
  }
  function renderStatus(next, fill = false) {
    state = next;
    $('#schedule-status').textContent = state.enabled ? `Tự động ${state.time} mỗi ngày` : 'Chưa bật lịch gửi';
    $('#webhook-status').textContent = state.configured ? `Đã lưu webhook ${state.webhookHost}. Để trống URL để giữ nguyên.${state.signed ? ' Đã lưu secret chữ ký.' : ''}` : 'Chưa cấu hình nhóm nhận.';
    $('#test-status').textContent = state.lastTest ? `Gửi tin kiểm tra ${when(state.lastTest.at)}: ${state.lastTest.ok ? 'Lark xác nhận đã nhận.' : state.lastTest.error}` : '';
    $('#period-hint').textContent = `Kỳ báo cáo 24 giờ: ${state.time} hôm trước → ${state.time} ngày báo cáo.`;
    if (fill) { $('#send-time').value = state.time; $('#enabled').checked = state.enabled; }
    const labels = { queued: 'Chờ gửi', sending: 'Đang gửi', sent: 'Đã gửi', failed: 'Lark từ chối', uncertain: 'Cần kiểm tra nhóm Lark' };
    $('#history').innerHTML = state.jobs.map(job => `<tr><td>${esc(job.date)}</td><td>${esc(labels[job.status] || job.status)}<br><span class="hint">${job.nextPart}/${job.totalParts} phần đã nhận</span></td><td>${esc(when(job.sentAt))}</td><td><div class="error-text">${esc(job.error)}</div>${['failed', 'uncertain'].includes(job.status) ? `<button type="button" data-retry="${esc(job.date)}" data-uncertain="${job.status === 'uncertain'}">Thử gửi lại</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4">Chưa có lần gửi nào.</td></tr>';
    $('#test').disabled = busy || !state.configured; $('#send').disabled = busy || !state.configured;
  }
  async function act(button, work) {
    if (busy) return;
    busy = true; const original = button.textContent; button.textContent = 'Đang xử lý…';
    document.querySelectorAll('button').forEach(element => { element.disabled = true; });
    try { await work(); } catch (error) { message(error.message, true); }
    finally {
      busy = false; button.textContent = original;
      document.querySelectorAll('button').forEach(element => { element.disabled = !authorized; });
      if (state && authorized) renderStatus(state);
    }
  }
  $('#settings').onsubmit = event => {
    event.preventDefault();
    act($('#settings button[type=submit]'), async () => {
      renderStatus(await api('', { action: 'configure', webhookUrl: $('#webhook').value.trim(), signingSecret: $('#secret').value.trim(), clearSecret: $('#clear-secret').checked, time: $('#send-time').value, enabled: $('#enabled').checked }), true);
      $('#webhook').value = ''; $('#secret').value = ''; $('#clear-secret').checked = false;
      message('Đã lưu cấu hình báo cáo Lark.');
    });
  };
  $('#test').onclick = () => act($('#test'), async () => {
    await api('', { action: 'test' }); renderStatus(await api());
    message('Lark xác nhận đã nhận tin kiểm tra. Bạn có thể bật lịch gửi báo cáo hằng ngày.');
  });
  $('#preview').onclick = () => act($('#preview'), async () => {
    const report = await api(`/preview?date=${encodeURIComponent($('#report-date').value)}`);
    $('#report-preview').textContent = report.text;
    message(report.partial ? 'Đang xem trước kỳ chưa kết thúc; số liệu sẽ tiếp tục cập nhật đến giờ gửi.' : 'Đã tải bản xem trước.');
  });
  $('#send').onclick = () => act($('#send'), async () => {
    const next = await api('', { action: 'send', date: $('#report-date').value }); renderStatus(next);
    const job = next.jobs.find(item => item.date === $('#report-date').value);
    message(job?.status === 'sent' ? 'Báo cáo ngày này đã gửi thành công trước đó.' : 'Đã nhận yêu cầu. Xem kết quả tại Lịch sử gửi bên dưới.');
  });
  $('#history').onclick = event => {
    const button = event.target.closest('[data-retry]'); if (!button) return;
    if (button.dataset.uncertain === 'true' && !confirm('Lark có thể đã nhận tin trước khi mất kết nối. Bạn đã kiểm tra nhóm và muốn gửi lại phần chưa được xác nhận?')) return;
    act(button, async () => { renderStatus(await api('', { action: 'send', date: button.dataset.retry, retry: true })); message('Đã đưa phần chưa gửi thành công vào hàng đợi.'); });
  };
  $('#report-date').value = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  api().then(data => renderStatus(data, true)).catch(error => message(error.message, true));
  setInterval(async () => {
    if (!authorized || busy || refreshing || document.hidden) return;
    refreshing = true;
    try { renderStatus(await api()); } catch (error) { message(error.message, true); }
    finally { refreshing = false; }
  }, 10000);
})();
