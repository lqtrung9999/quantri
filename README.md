# Báo cáo quản trị nội bộ Kim Thành Tín

Chuẩn bị tệp tài khoản (tệp này không được đẩy lên GitHub):

```bash
cp users.json.example users.json
```

Chạy ứng dụng với Node.js 18 trở lên:

```bash
npm start
```

Sau đó mở `http://localhost:3000`.

Có thể thay cổng bằng biến môi trường, ví dụ: `PORT=8080 npm start`.

## Phân quyền

- `admin`: xem tất cả dữ liệu.
- `accountant`: xem tất cả dữ liệu.
- `sale`: chỉ nhận được dữ liệu của Sale được gán trong trường `sale`.

Tạo các tài khoản đầu tiên. Với Sale, tên ở `--sale` phải khớp chính xác với cột SALE của Google Sheet:

```bash
npm run add-user -- --username admin --name "Quản trị viên" --role admin --password "MậtKhẩuMạnh"
npm run add-user -- --username ketoan --name "Kế toán" --role accountant --password "MậtKhẩuMạnh"
npm run add-user -- --username minh.nguyen --name "Nguyễn Minh" --role sale --sale "P5 HÀ PHƯƠNG" --password "MatKhauManh!2026"
```

Nếu dữ liệu cũ có các biến thể tên Sale, thêm các tên khớp chính xác, ngăn cách bằng `|`:

```bash
npm run add-user -- --username p5-ha-phuong --name "P5 HÀ PHƯƠNG" --role sale --sale "P5 HÀ PHƯƠNG" --sale-aliases "P5 HÀ PHƯ��NG|P5 HÀ PH��ƠNG" --password "MậtKhẩuMạnh"
```

Khi triển khai thật, thiết lập biến môi trường `SESSION_SECRET` thành một chuỗi ngẫu nhiên dài và không để Google Sheet ở chế độ công khai.

## Triển khai tự động

Mỗi lần đẩy lên nhánh `main`, GitHub Actions cập nhật mã nguồn trên máy chủ và khởi động lại dịch vụ. Các tệp `users.json`, `.session-secret` và thư mục nhật ký được giữ lại trên máy chủ, không nằm trong GitHub.
