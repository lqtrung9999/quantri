(() => {
  const normalizeDate = value => String(value || '').trim().split('/').map(part => Number(part)).join('/');
  const today = normalizeDate(new Date().toLocaleDateString('vi-VN'));
  const metrics = [...document.querySelectorAll('.metric')];
  const setMetric = (index, value, detail, tone = '') => {
    const metric = metrics[index];
    metric.querySelector('b').textContent = value;
    const description = metric.querySelector('b + span');
    description.textContent = detail;
    description.className = tone;
  };
  const refresh = () => {
    const rows = [...document.querySelectorAll('#rows tr')];
    const status = row => row.cells[6]?.querySelector('select')?.value || '';
    const category = row => row.cells[7]?.querySelector('select')?.value || '';
    const newToday = rows.filter(row => normalizeDate(row.cells[0]?.textContent) === today).length;
    const invited = rows.filter(row => status(row) === 'Đã gửi lời mời kết bạn').length;
    const potential = rows.filter(row => ['Khách tiềm năng', 'Khách cực kỳ tiềm năng'].includes(category(row))).length;
    const closed = rows.filter(row => status(row) === 'Khách chốt').length;
    setMetric(0, newToday, 'Khách mới tạo hôm nay', newToday ? 'green' : '');
    setMetric(1, invited, 'Đã gửi lời mời kết bạn', invited ? 'green' : '');
    setMetric(2, potential, 'Theo phân loại khách hàng', potential ? 'green' : '');
    setMetric(3, closed, 'Khách đã chốt dịch vụ', closed ? 'green' : '');
  };
  document.querySelector('#rows').addEventListener('change', refresh);
  new MutationObserver(refresh).observe(document.querySelector('#rows'), { childList: true, subtree: true });
  refresh();
})();
