(() => {
  'use strict';

  let popup;
  const close = () => popup?.remove();
  const open = image => {
    const source = image.currentSrc || image.src;
    if (!source) return;
    close();
    popup = document.createElement('div');
    popup.className = 'ktt-image-preview';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-label', 'Xem ảnh hàng kích thước lớn');
    popup.innerHTML = `<div class="ktt-image-preview__panel"><button type="button" aria-label="Đóng ảnh">×</button><img src="${source}" alt="${image.alt || 'Ảnh hàng'}"></div>`;
    popup.addEventListener('click', event => { if (event.target === popup || event.target.tagName === 'BUTTON') close(); });
    document.body.appendChild(popup);
  };

  document.addEventListener('click', event => {
    const image = event.target.closest('.ss-images img,.cl-image-link img,.xp-photo-thumb img');
    if (!image) return;
    event.preventDefault();
    open(image);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });

  const style = document.createElement('style');
  style.textContent = `.ktt-image-preview{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:#081321bf}.ktt-image-preview__panel{position:relative;display:grid;place-items:center;width:min(1100px,94vw);height:min(820px,88vh)}.ktt-image-preview__panel img{display:block;max-width:100%;max-height:100%;object-fit:contain;border-radius:10px;background:#fff;box-shadow:0 22px 60px #0008}.ktt-image-preview__panel button{position:absolute;right:-12px;top:-12px;z-index:1;width:38px;height:38px;border:2px solid #fff;border-radius:50%;background:#172237;color:#fff;font-size:28px;line-height:30px;cursor:pointer}`;
  document.head.appendChild(style);
})();
