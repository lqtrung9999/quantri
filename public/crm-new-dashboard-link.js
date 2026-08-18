(() => {
  const style = document.createElement('style');
  style.textContent = '.top{justify-content:flex-start;gap:18px}.top h1{margin-right:auto}.back-dashboard{display:inline-flex;align-items:center;gap:8px;padding:11px 17px;border:1px solid #d6a51b;border-radius:12px;background:#fff8e5;color:#694c13;text-decoration:none;font-weight:800;font-size:15px;box-shadow:0 2px 7px #8a650a1a}.back-dashboard:hover{background:#f8e9b9}@media(max-width:700px){.top{gap:10px}.back-dashboard{padding:9px 12px;font-size:13px}.top h1{font-size:19px}.user{gap:6px}}';
  document.head.append(style);
  const link = document.createElement('a');
  link.className = 'back-dashboard';
  link.href = '/';
  link.textContent = '← Dashboard';
  document.querySelector('.top').prepend(link);
})();
