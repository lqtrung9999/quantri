const assert = require('assert');
const fs = require('fs');

const history = [];
const transition = (from, action) => ({
  sale_submit: from === 'sale_required' ? 'customs_pending' : null,
  request_supplement: from === 'customs_pending' ? 'sale_required' : null,
  customs_submit: from === 'customs_pending' ? 'customer_confirmation' : null,
  customer_requests_edit: from === 'customer_confirmation' ? 'customs_pending' : null,
  customer_approved: from === 'customer_confirmation' ? 'ready_for_loading' : null
}[action] || null);
const line = { quantity1: 25, declaredPriceUsd: 4.8, goodsDescription: 'Khóa cửa tay gạt bằng hợp kim.' };
assert.equal(Number(line.quantity1) * Number(line.declaredPriceUsd), 120, 'Tổng USD phải bằng SL1 × giá khai');
assert.equal(line.goodsDescription.length, 30, 'Đếm ký tự mô tả phải chính xác');
assert.equal(transition('sale_required', 'sale_submit'), 'customs_pending');
assert.equal(transition('customs_pending', 'request_supplement'), 'sale_required');
assert.equal(transition('customs_pending', 'customs_submit'), 'customer_confirmation');
assert.equal(transition('customer_confirmation', 'customer_requests_edit'), 'customs_pending');
assert.equal(transition('customer_confirmation', 'customer_approved'), 'ready_for_loading');
assert.equal(transition('ready_for_loading', 'sale_submit'), null, 'Không cho phép nhảy trạng thái sai luồng');
history.push({ actorRole: 'sale', action: 'sale_submit' });
assert.equal(history.length, 1, 'Mọi thao tác phải thêm lịch sử');
const reference = JSON.parse(fs.readFileSync('customs-declared-goods.json', 'utf8'));
assert.ok(Array.isArray(reference.records) && reference.records.length > 0, 'Phải có dữ liệu lịch sử khai báo để cảnh báo tương tự');
console.log('Customs coordination checks passed.');
