# Hệ thống Quản trị Lớp học cho Giáo viên (`cm-class`)

Hệ thống quản trị lớp học toàn diện dành cho giáo viên và trung tâm luyện thi, xây dựng trên nền tảng **Next.js 15 (App Router + TypeScript)**, **PostgreSQL + Prisma ORM**, và **Tailwind CSS + shadcn/ui**.

## Tính năng chính (9 Modules)

1. **Workspace & Xác thực đa người dùng (Multi-tenant Isolation)**:
   - Mỗi giáo viên sở hữu một `Workspace` độc lập (1-1).
   - Mọi truy vấn và thao tác dữ liệu đều cô lập nghiêm ngặt theo `workspaceId`.
   - Cấu hình thông tin trung tâm, luồng camera lớp học và tài khoản ngân hàng nhận học phí VietQR.
2. **Quản lý Lớp học & Thời khoá biểu**:
   - Tạo, chỉnh sửa, lưu trữ lớp học (`ACTIVE`, `UPCOMING`, `COMPLETED`, `ARCHIVED`) và biểu phí mặc định.
   - Thiết lập lịch học định kỳ hàng tuần (`ScheduleSlot`), hiển thị lưới thời khoá biểu tuần và tự động cảnh báo xung đột lịch dạy / trùng phòng.
   - Tự động sinh buổi học (`Session`) từ lịch tuần trong khoảng ngày tuỳ chọn (idempotent).
3. **Quản lý Học sinh, Phụ huynh & Ghi danh**:
   - Hồ sơ học sinh với mã tự động (`HS001`...), tìm kiếm và lọc theo lớp/trạng thái.
   - Quản lý nhiều phụ huynh trên mỗi học sinh với cơ chế tự động duy trì liên hệ chính (`isPrimary`).
   - Ghi danh học sinh vào lớp với cấu hình miễn giảm học phí riêng (`FIXED` hoặc `PERCENTAGE`).
4. **Quản lý Học phí, Thanh toán & Mã QR VietQR**:
   - Đa biểu phí (`MONTHLY`, `PER_COURSE`, `PER_SESSION`).
   - Sinh phiếu thu hàng loạt hoặc từng học sinh, tự động áp dụng miễn giảm.
   - Ghi nhận thanh toán tiền mặt / chuyển khoản từng phần (`PARTIAL`) hoặc toàn bộ (`PAID`).
   - Sinh mã **VietQR EMVCo CRC-16** động kèm nội dung chuyển khoản chuẩn hoá `HP <MãHS> <MãPhiếu>` và báo cáo công nợ theo lớp/kỳ.
5. **Quản lý Buổi học, Điểm danh (Thủ công & Browser FaceAI) & Bài tập về nhà**:
   - Điểm danh đến (`checkInAt`), ra về (`checkOutAt`) và thao tác nhanh toàn lớp.
   - **Điểm danh nhanh bằng FaceAI trên trình duyệt**: Đăng ký vector khuôn mặt 128 chiều chuẩn hoá L2 (từ Webcam, Camera IP qua proxy an toàn CORS/SSRF, ảnh tải lên hoặc chân dung mẫu) và quét nhận diện tự động theo ngưỡng tương đồng Cosine / khoảng cách Euclidean kèm chống quét lặp (cooldown).
   - Giao bài tập về nhà gắn câu hỏi từ kho bài tập, theo dõi nộp bài, tự động phát hiện nộp muộn và chấm điểm.
6. **Kho Minigame Lớp học**:
   - Quản lý 5 thể loại trò chơi tương tác: `SPEED_QUIZ` (Trắc nghiệm tốc độ), `FLASH_MATCH` (Ghép cặp thẻ), `WORD_CROSS` (Giải ô chữ), `TEAM_BUZZER` (Chuông đội), `LUCKY_WHEEL` (Vòng quay may mắn).
7. **Kho Bài tập & Ngân hàng Câu hỏi**:
   - Quản lý câu hỏi (`MULTIPLE_CHOICE`, `FILL_IN_BLANK`, `SHORT_ANSWER`, `ESSAY`) phân loại theo môn, chủ đề, độ khó (`EASY`, `MEDIUM`, `HARD`), thẻ tag và nhập hàng loạt (bulk import).
8. **Tổ chức Game Trực tiếp trong Buổi học**:
   - Khởi tạo phiên chơi (`GameSession`) theo chế độ cá nhân (`INDIVIDUAL`) hoặc theo đội (`TEAM`), trình chiếu sân khấu lớp học và tự động xếp hạng kết quả (`GameResult`).
9. **Bảng Xếp Hạng Đa Tiêu Chí Tuỳ Chỉnh (`Leaderboard`)**:
   - Tính điểm tổng hợp chuẩn hoá trên thang `0–100` từ 4 tiêu chí: Chuyên cần ($S_{\text{att}}$), Bài tập về nhà ($S_{\text{hw}}$), Minigame ($S_{\text{game}}$) và Điểm thưởng/phạt ($S_{\text{bonus}}$).
   - Tuỳ chỉnh thanh trượt trọng số theo thời gian thực, lọc theo lớp/khoảng thời gian và vinh danh Top 3 Podium.

---

## Cài đặt & Khởi chạy

```bash
# 1. Cài đặt dependencies
npm install

# 2. Khởi chạy PostgreSQL cục bộ & chạy Prisma migrations
npm run db:migrate

# 3. Nạp dữ liệu mẫu (Giáo viên A: giaovien@cmclass.vn / 123456, 3 lớp, 20 học sinh)
npm run db:seed

# 4. Chạy môi trường phát triển
npm run dev
```

## Kiểm thử & Build Production

```bash
# Chạy Unit & Integration Tests (Vitest)
npm test

# Chạy bộ kiểm thử E2E toàn diện (Playwright — Tiers 1–5)
npx playwright test

# Build Production
npm run build
```
