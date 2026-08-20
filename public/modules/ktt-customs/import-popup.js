(() => {
  const root = document.getElementById('customs-flow-app');
  const opener = root?.querySelector('#cf-import-open');
  if (!root || !opener) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const number = value => {
    const text = String(value ?? '').trim().replace(/\s/g, '');
    if (!text) return 0;
    const normalized = text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text.replace(/,/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const displayDate = value => {
    const text = String(value ?? '').trim();
    const yyyy = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (yyyy) return `${Number(yyyy[3])}/${Number(yyyy[2])}/${yyyy[1]}`;
    return text;
  };

  const modal = document.createElement('div');
  modal.id = 'cf-import-modal';
  modal.className = 'cf-modal cf-import-modal';
  modal.innerHTML = `
    <div class="cf-dialog cf-import-dialog" role="dialog" aria-modal="true" aria-labelledby="cf-import-title">
      <div class="cf-dialog-head"><div><h2 id="cf-import-title">Nhập dữ liệu hàng về kho TQ</h2><p>Dán nguyên bảng từ Google Sheets. Dữ liệu này được lưu riêng cho Khai Báo HQ.</p></div><button class="cf-import-close" aria-label="Đóng">×</button></div>
      <div class="cf-import-body">
        <div class="cf-import-help"><div><b>Quy trình đầu ngày</b><span>1. Sao chép bảng hàng về kho &nbsp; 2. Dán vào ô bên dưới &nbsp; 3. Kiểm tra bảng xem trước &nbsp; 4. Lưu để chuyển Sale và Khai báo HQ xử lý.</span></div><small>Khi lưu, mã mới sẽ ở trạng thái <b>Chờ Sale bổ sung</b>.</small></div>
        <div class="cf-import-section"><div class="cf-import-section-head"><div><h3>1. Dán dữ liệu</h3><p>Có thể dán kèm hoặc không kèm dòng tiêu đề.</p></div><button id="cf-import-clear" class="cf-action" type="button">Xóa bảng dán</button></div>
          <div class="cf-import-columns">1. Ngày/tháng <i></i> 2. Mã hàng <i></i> 3. Số kiện <i></i> 4. Tên hàng <i></i> 5. Mã KH <i></i> 6. Chủ hàng <i></i> 7. Sale <i></i> 8. Phòng Sale <i></i> 9. Kế toán <i></i> 10. KG <i></i> 11. M³</div>
          <textarea id="cf-import-paste" placeholder="Dán dữ liệu từ Google Sheets vào đây..."></textarea>
        </div>
        <div class="cf-import-section cf-import-preview"><div class="cf-import-section-head"><div><h3>2. Kiểm tra trước khi lưu</h3><p id="cf-import-summary">Chưa có dữ liệu để xem trước.</p></div></div><div id="cf-import-message" class="cf-import-message"></div><div class="cf-import-table-wrap"><table><thead><tr><th>#</th><th>Ngày</th><th>Mã hàng</th><th>Kiện</th><th>Tên hàng</th><th>Mã KH</th><th>Chủ hàng</th><th>Sale</th><th>Phòng</th><th>Kế toán</th><th>KG</th><th>M³</th><th>Trạng thái</th></tr></thead><tbody id="cf-import-preview"></tbody></table></div></div>
      </div>
      <div class="cf-import-foot"><span id="cf-import-note">Các mã vừa lưu sẽ xuất hiện ngay trong danh sách công việc chung.</span><div><button class="cf-action cf-import-close" type="button">Hủy</button><button id="cf-import-save" class="cf-action primary" type="button" disabled>Lưu dữ liệu vào hệ thống</button></div></div>
    </div>`;
  // The locked module scopes all modal styles under #customs-flow-app.
  // Keeping the import dialog inside that root makes it a real overlay,
  // rather than a normal block appended at the end of the page.
  root.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `
    #customs-flow-app .cf-import-modal.open{display:flex!important;position:fixed;inset:0;z-index:999;background:rgba(7,17,30,.68);align-items:center;justify-content:center;padding:18px;box-sizing:border-box}#customs-flow-app .cf-import-modal .cf-import-dialog{width:min(1240px,94vw);max-height:90vh;display:flex;flex-direction:column;background:#fff;border:1px solid #dce4f0;border-radius:16px;box-shadow:0 25px 70px #0007;overflow:hidden}.cf-import-dialog h2{margin:0;font-size:22px}.cf-import-dialog p{margin:4px 0 0;color:#71809a;font-size:13px}.cf-import-close{border:0;background:transparent;font-size:28px;line-height:1;color:#1f2b3d;cursor:pointer}.cf-import-body{padding:18px 22px;overflow:auto;background:#f5f7fb}.cf-import-help{display:flex;justify-content:space-between;gap:20px;padding:14px 16px;background:#fff;border:1px solid #dce4f0;border-radius:12px;color:#61708a;font-size:13px}.cf-import-help b{display:block;color:#1f2b3d;margin-bottom:4px}.cf-import-help small{max-width:230px;line-height:1.55}.cf-import-section{margin-top:14px;padding:16px;background:#fff;border:1px solid #dce4f0;border-radius:12px}.cf-import-section-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.cf-import-section-head h3{margin:0;color:#202c40;font-size:18px}.cf-import-section-head p{margin-top:3px}.cf-import-columns{margin-top:14px;padding:11px 13px;background:#f2f5fa;border:1px solid #dce4f0;border-radius:8px;color:#61708a;font-size:12px;font-weight:700;white-space:nowrap;overflow:auto}.cf-import-columns i{display:inline-block;height:15px;border-left:1px solid #cfd8e6;margin:0 7px -3px}.cf-import-section textarea{box-sizing:border-box;width:100%;height:150px;margin-top:12px;padding:13px;border:1px solid #cfd8e6;border-radius:9px;resize:vertical;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#172235}.cf-import-section textarea:focus{outline:2px solid #2b7de9;border-color:transparent}.cf-import-message{min-height:18px;margin:10px 0 0;font-size:13px}.cf-import-message.ok{color:#168a5b}.cf-import-message.error{color:#ca532d}.cf-import-table-wrap{max-height:260px;overflow:auto;border:1px solid #e1e7f0;border-radius:8px}.cf-import-table-wrap table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:12px}.cf-import-table-wrap th{position:sticky;top:0;background:#edf1f7;color:#66758e;text-align:left;padding:9px}.cf-import-table-wrap td{padding:8px 9px;border-top:1px solid #e7ebf1;color:#26334a}.cf-import-table-wrap td:last-child{font-weight:700}.cf-import-valid{color:#168a5b!important}.cf-import-invalid{color:#ca532d!important}.cf-import-foot{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 22px;border-top:1px solid #dce4f0;background:#fff}.cf-import-foot span{font-size:13px;color:#65738b}.cf-import-foot div{display:flex;gap:8px}.cf-import-foot .primary{background:#168a5b;border-color:#168a5b;color:#fff}.cf-import-foot .primary:disabled{opacity:.45;cursor:not-allowed}@media(max-width:720px){.cf-import-help,.cf-import-foot{align-items:flex-start;flex-direction:column}.cf-import-dialog h2{font-size:18px}}
  `;
  document.head.appendChild(style);

  const get = selector => modal.querySelector(selector);
  let parsedRows = [];
  const saveThroughParent = rows => new Promise((resolve, reject) => {
    const requestId = `warehouse-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeout = setTimeout(() => { window.removeEventListener('message', onMessage); reject(new Error('Hệ thống phản hồi quá lâu. Vui lòng thử lại.')); }, 30000);
    const onMessage = event => {
      const message = event.data || {};
      if (event.source !== window.top || message.type !== 'ktt-customs-import-result' || message.requestId !== requestId) return;
      clearTimeout(timeout); window.removeEventListener('message', onMessage);
      if (message.ok) resolve(message.result || {}); else reject(new Error(message.error || 'Không thể lưu dữ liệu.'));
    };
    window.addEventListener('message', onMessage);
    // The UI module is nested in an iframe inside the locked module wrapper.
    // Send straight to the page that owns the authenticated API bridge.
    window.top.postMessage({ type: 'ktt-customs-import-save', requestId, rows }, '*');
  });
  const errorsFor = row => {
    const errors = [];
    if (!row.operationDate) errors.push('Thiếu ngày');
    if (!row.cargoCode) errors.push('Thiếu mã hàng');
    if (!row.ownerName) errors.push('Thiếu chủ hàng');
    if (row.columnCount < 11) errors.push('Thiếu cột');
    return errors;
  };
  const parse = () => {
    const source = get('#cf-import-paste').value.replace(/\r/g, '').trim();
    if (!source) { parsedRows = []; renderPreview(); return; }
    const values = source.split('\n').map(line => line.split('\t').map(cell => cell.trim()));
    const header = values[0]?.some(cell => /ngày|mã hàng|số kiện|tên hàng|chủ hàng/i.test(cell));
    parsedRows = (header ? values.slice(1) : values).filter(line => line.some(Boolean)).map((line, index) => ({
      line: index + 1, operationDate: displayDate(line[0]), cargoCode: line[1] || '', packageCount: line[2] || '', productName: line[3] || '', customerCode: line[4] || '', ownerName: line[5] || '', saleOwner: line[6] || '', saleTeam: line[7] || '', accountant: line[8] || '', weightKg: line[9] || '', volumeM3: line[10] || '', columnCount: line.length
    }));
    renderPreview();
  };
  const renderPreview = () => {
    const codeCounts = new Map();
    parsedRows.forEach(row => { const code = row.cargoCode.trim().toLocaleLowerCase('vi-VN'); if (code) codeCounts.set(code, (codeCounts.get(code) || 0) + 1); });
    const clean = parsedRows.filter(row => !errorsFor(row).length && codeCounts.get(row.cargoCode.trim().toLocaleLowerCase('vi-VN')) === 1);
    const bad = parsedRows.length - clean.length;
    get('#cf-import-summary').textContent = parsedRows.length ? `${parsedRows.length} dòng đã nhận · ${clean.length} dòng sẵn sàng lưu${bad ? ` · ${bad} dòng cần kiểm tra` : ''}` : 'Chưa có dữ liệu để xem trước.';
    const message = get('#cf-import-message');
    message.className = `cf-import-message ${bad ? 'error' : parsedRows.length ? 'ok' : ''}`;
    message.textContent = !parsedRows.length ? '' : bad ? 'Kiểm tra các dòng thiếu thông tin hoặc trùng mã hàng trong bảng dán.' : 'Dữ liệu hợp lệ. Mã mới sẽ vào luồng Chờ Sale bổ sung.';
    get('#cf-import-save').disabled = !clean.length;
    get('#cf-import-preview').innerHTML = parsedRows.length ? parsedRows.map(row => {
      const errors = errorsFor(row); const duplicate = codeCounts.get(row.cargoCode.trim().toLocaleLowerCase('vi-VN')) > 1;
      if (duplicate) errors.push('Trùng mã hàng');
      return `<tr><td>${row.line}</td><td>${escapeHtml(row.operationDate)}</td><td><b>${escapeHtml(row.cargoCode)}</b></td><td>${escapeHtml(row.packageCount)}</td><td>${escapeHtml(row.productName)}</td><td>${escapeHtml(row.customerCode)}</td><td>${escapeHtml(row.ownerName)}</td><td>${escapeHtml(row.saleOwner)}</td><td>${escapeHtml(row.saleTeam)}</td><td>${escapeHtml(row.accountant)}</td><td>${escapeHtml(row.weightKg)}</td><td>${escapeHtml(row.volumeM3)}</td><td class="${errors.length ? 'cf-import-invalid' : 'cf-import-valid'}">${errors.length ? escapeHtml(errors.join(' · ')) : 'Sẵn sàng'}</td></tr>`;
    }).join('') : '<tr><td colspan="13" style="text-align:center;color:#71809a;padding:22px">Dán bảng dữ liệu để bắt đầu.</td></tr>';
  };
  const mergeIntoWorkList = records => {
    const data = window.KTT_CUSTOMS_DATA;
    if (!Array.isArray(data)) return;
    records.forEach(record => {
      const code = String(record.cargoCode || '').trim();
      if (!code) return;
      // Every code imported by Kho TQ starts with an editable product line.  This
      // lets Sale continue immediately instead of landing on an empty table.
      const item = { code, lot: '', packs: number(record.packageCount), name: record.productName || 'Chưa cập nhật', customer: record.customerCode || '—', owner: record.ownerName || '—', sale: record.saleOwner || 'Chưa phân công', accounting: record.accountant || '—', kg: number(record.weightKg), m3: number(record.volumeM3), photos: 0, docs: 'Chưa kiểm tra', status: 'sale', saleInfo: { product: record.productName || '', usage: '', material: '', model: '', qty: '', unit: 'PCE', invoicePrice: '', note: '', productLines: [{ description: record.productName || '', packs: String(record.packageCount ?? ''), productsPerPack: '', size: '', qty: '', unit: 'PCE', invoicePrice: '', note: '', image: null }] }, customsLines: [], history: [[new Date().toLocaleDateString('vi-VN'), 'Kho TQ', 'Đã nhập từ bảng dán', 'Chờ Sale bổ sung']] };
      const index = data.findIndex(row => String(row.code).trim().toLocaleLowerCase('vi-VN') === code.toLocaleLowerCase('vi-VN'));
      if (index >= 0) Object.assign(data[index], item); else data.unshift(item);
    });
    window.KTT_CUSTOMS_RENDER?.();
  };
  const save = async () => {
    const seen = new Set();
    const clean = parsedRows.filter(row => {
      const code = row.cargoCode.trim().toLocaleLowerCase('vi-VN');
      if (errorsFor(row).length || !code || seen.has(code)) return false;
      seen.add(code); return true;
    });
    if (!clean.length) return;
    const button = get('#cf-import-save');
    button.disabled = true; button.textContent = 'Đang lưu…';
    try {
      const result = await saveThroughParent(clean);
      mergeIntoWorkList(clean);
      get('#cf-import-note').textContent = `Đã lưu ${result.total} mã hàng (${result.created} mã mới, ${result.updated} mã cập nhật). Các mã đã xuất hiện trong công việc chung.`;
      get('#cf-import-paste').value = ''; parsedRows = []; renderPreview();
      setTimeout(() => modal.classList.remove('open'), 900);
    } catch (error) {
      get('#cf-import-note').textContent = error.message || 'Không thể lưu dữ liệu.';
      button.disabled = false;
    } finally { button.textContent = 'Lưu dữ liệu vào hệ thống'; }
  };
  get('#cf-import-paste').addEventListener('input', parse);
  get('#cf-import-clear').onclick = () => { get('#cf-import-paste').value = ''; parse(); };
  get('#cf-import-save').onclick = save;
  modal.querySelectorAll('.cf-import-close').forEach(button => button.onclick = () => modal.classList.remove('open'));
  modal.onclick = event => { if (event.target === modal) modal.classList.remove('open'); };
  opener.type = 'button';
  opener.onclick = event => { event.preventDefault(); event.stopPropagation(); get('#cf-import-note').textContent = 'Các mã vừa lưu sẽ xuất hiện ngay trong danh sách công việc chung.'; modal.classList.add('open'); get('#cf-import-paste').focus({ preventScroll: true }); };
  renderPreview();
})();
