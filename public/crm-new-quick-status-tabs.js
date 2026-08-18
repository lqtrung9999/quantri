(() => {
  const filters = [
    { label: 'Tất cả', match: () => true },
    { label: 'Đã gửi lời mời kết bạn', match: row => row.cells[6].querySelector('select')?.value === 'Đã gửi lời mời kết bạn' },
    { label: 'Đã tư vấn dịch vụ', match: row => row.cells[6].querySelector('select')?.value === 'Đã tư vấn dịch vụ' },
    { label: 'Khách đang xem xét', match: row => row.cells[6].querySelector('select')?.value === 'Khách đang xem xét' },
    { label: 'Khách tiềm năng', match: row => row.cells[7].querySelector('select')?.value === 'Khách tiềm năng' },
    { label: 'Khách cực kỳ tiềm năng', match: row => row.cells[7].querySelector('select')?.value === 'Khách cực kỳ tiềm năng' }
  ];
  const nav = document.querySelector('.tabs');
  nav.innerHTML = filters.map((filter, index) => `<span class="${index === 0 ? 'active' : ''}">${filter.label}</span>`).join('');
  [...nav.children].forEach((tab, index) => tab.addEventListener('click', () => {
    [...nav.children].forEach(item => item.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('#rows tr').forEach(row => { row.hidden = !filters[index].match(row); });
  }));
})();
