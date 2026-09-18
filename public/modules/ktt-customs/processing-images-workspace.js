(() => {
  'use strict';

  const workspace = document.querySelector('#cf-processing-workspace');
  if (!workspace) return;
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const imagesFor = row => { try { return JSON.parse(row.dataset.saleImages || '[]'); } catch { return []; } };
  const setImages = (row, images) => { row.dataset.saleImages = JSON.stringify(images); };
  const itemFor = card => (window.KTT_CUSTOMS_DATA || []).find(item => item._id === card.dataset.id);
  const imageCell = (row, editable) => {
    const images = imagesFor(row);
    const thumbs = images.length ? images.map((image, index) => `<a class="xp-photo-thumb" href="${esc(image.url)}" target="_blank" rel="noopener"><img src="${esc(image.url)}" alt="Ảnh hàng ${index + 1}"></a>${editable ? `<button class="xp-photo-remove" type="button" data-photo-index="${index}" aria-label="Xóa ảnh">×</button>` : ''}`).join('') : '<span>Chưa có ảnh</span>';
    return `<td class="pin xp-photo-cell"><div class="xp-photo-list">${thumbs}</div>${editable ? '<label class="xp-photo-add">＋ Thêm ảnh<input class="xp-row-image" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><small>JPG/PNG/WebP · mỗi ảnh tối đa 8 MB</small>' : ''}</td>`;
  };
  const paint = () => workspace.querySelectorAll('.xp-card:not(.xp-confirm-card)').forEach(card => {
    const item = itemFor(card), rows = [...card.querySelectorAll('.xp-table tbody tr')];
    const productHead = card.querySelector('.xp-table thead .pin.product');
    if (productHead && !card.querySelector('.xp-photo-head')) productHead.insertAdjacentHTML('afterend', '<th class="pin xp-photo-head" rowspan="2">Ảnh hàng</th>');
    const editable = Boolean(card.querySelector('.xp-sale-draft'));
    rows.forEach((row, index) => {
      if (!row.dataset.saleImages) setImages(row, item?.saleInfo?.productLines?.[index]?.images || (item?.saleInfo?.productLines?.[index]?.image ? [{ url: item.saleInfo.productLines[index].image }] : []));
      const cell = row.querySelector('.xp-photo-cell');
      if (cell) cell.outerHTML = imageCell(row, editable);
      else row.querySelector('.pin.product')?.insertAdjacentHTML('afterend', imageCell(row, editable));
    });
  });
  async function compress(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) throw new Error(`${file.name}: chỉ nhận JPG, PNG hoặc WebP tối đa 8 MB.`);
    const source = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const image = await new Promise((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = source; });
    const ratio = Math.min(1, 720 / Math.max(image.width, image.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return { id: `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, url: canvas.toDataURL('image/jpeg', .72), fileName: file.name, mimeType: 'image/jpeg' };
  }
  const field = (row, name) => row.querySelector(`[data-sale-field="${name}"]`)?.value?.trim() || '';
  const payload = card => [...card.querySelectorAll('.xp-table tbody tr')].map(row => ({ description: field(row, 'description'), packageCount: field(row, 'packs'), productsPerPackage: field(row, 'productsPerPack'), productSize: field(row, 'size'), declarationQuantity: field(row, 'qty'), declarationUnit: field(row, 'unit'), invoicePriceBeforeVat: field(row, 'invoicePrice'), note: field(row, 'note'), images: imagesFor(row) })).filter(line => line.description);
  workspace.addEventListener('change', async event => {
    const input = event.target.closest('.xp-row-image'); if (!input?.files?.length) return;
    const row = input.closest('tr'); try { const images = imagesFor(row); for (const file of [...input.files].slice(0, 10 - images.length)) images.push(await compress(file)); setImages(row, images); paint(); workspace.dataset.dirty = '1'; } catch (error) { alert(error.message || 'Không thể đọc ảnh hàng.'); }
  });
  workspace.addEventListener('click', event => {
    const remove = event.target.closest('.xp-photo-remove'); if (!remove) return;
    event.preventDefault(); const row = remove.closest('tr'), images = imagesFor(row); images.splice(Number(remove.dataset.photoIndex), 1); setImages(row, images); paint(); workspace.dataset.dirty = '1';
  });
  workspace.addEventListener('click', async event => {
    const button = event.target.closest('.xp-sale-draft,.xp-sale-submit'); if (!button || button.dataset.photoSaving === '1') return;
    event.preventDefault(); event.stopImmediatePropagation(); const card = button.closest('.xp-card'); if (!card) return;
    button.dataset.photoSaving = '1'; button.disabled = true; const action = button.classList.contains('xp-sale-draft') ? 'save_sale_draft' : 'save_sale';
    try { const response = await fetch('/api/customs-coordination', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id: card.dataset.id, record: { productLines: payload(card) } }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Không thể lưu dữ liệu Sale.'); workspace.dataset.dirty = ''; await window.KTT_CUSTOMS_REFRESH?.(); alert(action === 'save_sale' ? 'Đã gửi thông tin Sale và ảnh hàng cho bộ phận Khai báo.' : 'Đã lưu nháp thông tin Sale và ảnh hàng.'); } catch (error) { alert(error.message || 'Không thể lưu ảnh hàng.'); button.disabled = false; } finally { delete button.dataset.photoSaving; }
  }, true);
  new MutationObserver(paint).observe(workspace, { childList: true, subtree: true }); paint();
  const style = document.createElement('style'); style.textContent = `.xp-table{min-width:3380px!important}.xp-table .pin.product{box-shadow:none!important}.xp-table .xp-photo-head,.xp-table .xp-photo-cell{left:262px;min-width:126px;width:126px;z-index:4;background:#f8fafc!important}.xp-table thead .xp-photo-head{z-index:6!important}.xp-photo-cell{padding:5px!important}.xp-photo-list{display:flex;flex-wrap:wrap;justify-content:center;gap:4px;min-height:32px}.xp-photo-thumb{display:block;width:35px;height:35px;border:1px solid #c8d4e3;border-radius:5px;overflow:hidden}.xp-photo-thumb img{width:100%;height:100%;object-fit:cover}.xp-photo-remove{align-self:flex-start;margin:-4px 0 0 -8px;width:16px;height:16px;padding:0;border:1px solid #de9b9b;border-radius:50%;background:#fff;color:#b53232;line-height:12px;cursor:pointer}.xp-photo-cell span{align-self:center;color:#78869b;font-size:10px}.xp-photo-add{display:block;margin-top:5px;border:1px dashed #80a16b;border-radius:6px;padding:5px 4px;background:#f5fbef;color:#3d6f2c;font-size:10px;font-weight:800;cursor:pointer}.xp-photo-add input{display:none!important}.xp-photo-cell small{display:block;margin-top:4px;color:#7a8798;font-size:9px;line-height:1.2}`; document.head.appendChild(style);
})();
