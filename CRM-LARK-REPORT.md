# Báo cáo CRM Mới → Lark

Admin mở `/crm-new-lark.html` hoặc bấm **Báo cáo Lark** ở đầu trang CRM Mới.

1. Tạo Custom Bot trong nhóm Lark cần nhận báo cáo, sao chép webhook.
2. Nhập webhook và secret chữ ký nếu bot có bật xác minh. Nếu dùng từ khóa bảo vệ bot, thêm `KTT`.
3. Giữ giờ gửi `17:30` (Asia/Ho_Chi_Minh), lưu cấu hình và bấm **Gửi tin kiểm tra**.
4. Kiểm tra tin đã xuất hiện trong đúng nhóm, bật **Bật gửi báo cáo hằng ngày**, lưu lại.

Hướng dẫn chính thức: <https://open.larksuite.com/document/client-docs/bot-v3/add-custom-bot>.

## Nội dung và kỳ báo cáo

- Mỗi ngày báo cáo kỳ 24 giờ: `[17:30 hôm trước, 17:30 ngày báo cáo)`. Scheduler kiểm tra mỗi 30 giây, gửi trong vòng khoảng 30 giây sau giờ đã chọn khi máy chủ hoạt động.
- Data mới dựa trên `createdAt`. Hồ sơ cũ thiếu giờ tạo dùng 00:00 ngày `foundAt` và được ghi chú trong báo cáo.
- Khách chăm sóc: có ghi chú hoặc thay đổi trạng thái Zalo/phân loại/kết quả trong kỳ. Một khách được tính một lần, kể cả khách tạo từ trước kỳ.
- Ghi chú đếm số ghi chú sale thêm trong kỳ. Phản hồi Admin không tính thành chăm sóc của sale.
- Các bước Zalo đếm số khách được chuyển vào bước đó trong kỳ, mỗi khách một lần trên mỗi bước.
- Kết quả đếm khách có thay đổi sang Đã Chốt/Chưa Chốt Được trong kỳ và còn giữ kết quả đó tại mốc kết thúc. Lịch sử `from` được dùng để hoàn nguyên các thay đổi sau mốc khi gửi bù.
- Tổng hợp toàn công ty, theo phòng và sale. Tài khoản sale hoạt động vẫn hiện số 0 khi không có phát sinh; các sale cũ có phát sinh vẫn được tính. Tin Lark không chứa SĐT, tên khách hay nội dung ghi chú.
- Bản xem trước trước giờ gửi được đánh dấu chưa đủ kỳ. Gửi thủ công chỉ thực hiện với kỳ đã kết thúc.

## Vận hành

`crm-new-lark-report.js` là module độc lập; API `/api/crm-new/lark-report` và `/preview` yêu cầu phiên đăng nhập Admin. Chỉ cho phép URL webhook HTTPS chính thức Lark/Feishu, không đi theo redirect. HTTP 200 chỉ được coi thành công khi Lark trả `code: 0` (hoặc `StatusCode: 0`). Chữ ký HMAC theo tài liệu Custom Bot.

Cấu hình, báo cáo đã chốt, tiến độ từng phần và kết quả gửi lưu trong `crm-new-lark-private/state.json` (file 0600, thư mục 0700), ngoài `public/`. Git và rsync deployment loại trừ toàn bộ thư mục này. Sao lưu Google Sheet cuối ngày và thao tác lưu CRM giữ nguyên luồng hiện tại.

- Khi khởi động lại, scheduler gửi bù các kỳ đến hạn kể từ ngày bật lịch. Báo cáo đã được Lark xác nhận sẽ không gửi lại. Tắt lịch dừng các phần tự động chưa gửi; yêu cầu gửi thủ công vẫn thực hiện.
- Tin dài tự chia phần dưới 20 KB và gửi tối đa một phần mỗi lần chạy. Phần đã xác nhận không gửi lại khi retry.
- Lark từ chối: tối đa 5 lần thử mỗi phần, cách nhau 2/4/8/16 phút; Admin xem lỗi và thử lại sau khi sửa cấu hình.
- Mất kết nối, phản hồi không xác định hoặc khởi động lại trong khi đang POST: ghi trạng thái **Cần kiểm tra nhóm Lark**. Admin kiểm tra nhóm rồi quyết định thử lại; webhook không cung cấp khả năng bảo đảm exactly-once khi mất xác nhận.
- Máy chủ cần đang chạy để gửi; khi hoạt động trở lại sẽ xử lý các kỳ bị lỡ. Máy chủ phải đồng bộ giờ cho xác minh chữ ký.

Kiểm thử: `npm run test:crm-lark` và `npm run test:crm-new`. Các kiểm thử dùng dữ liệu giả và mô phỏng Lark; việc nhận tin thực tế cần được xác nhận bằng webhook của nhóm đích.
