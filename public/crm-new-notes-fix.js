(() => {
  const style = document.createElement('style');
  style.textContent = '.crm-modal .crm-box{width:min(820px,calc(100vw - 36px))}.crm-modal .crm-head{padding:25px 30px;font-size:23px}.crm-modal #note-history{padding:14px 30px!important;max-height:230px!important}.crm-modal #note-history p{font-size:15px!important;margin:8px 0}.crm-modal> .crm-box>div:nth-child(3){padding:0 30px 12px!important}.crm-modal #note-text{height:94px!important;font-size:15px!important}.crm-modal .crm-foot{padding:18px 30px}.crm-modal .crm-cancel,.crm-modal .crm-save{padding:12px 20px;font-size:16px}';
  document.head.append(style);
  document.addEventListener('click', event => {
    const note = event.target.closest('.note');
    if (!note) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    window.openCrmNewNote?.(note);
  }, true);
})();
