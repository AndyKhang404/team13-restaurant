## 1. Các giai đoạn và prompt đã dùng

### Giai đoạn 1 — Biến mockup HTML/CSS thành trang SSR nối backend
*(prompt ở các session đầu, tóm tắt — không còn lưu nguyên văn)*

| # | Prompt (tóm tắt) | Yêu cầu cốt lõi |
|---|---|---|
| 1 | "Làm món ăn trên web lấy data/ảnh thật, không mock; design thêm cho chuẩn business" | Render dữ liệu thật từ DB/Supabase vào view, ảnh món thật, CTA hotline, giờ mở cửa, USP |
| 2 | "Chỉ được chạm vào views `.hbs` và CSS" | AI tuân thủ ranh giới: không đụng logic backend trừ khi được yêu cầu |
| 3 | "Port toàn bộ mock design (style.css/admin.css) vào mọi view: public + admin list; form admin giữ Tailwind" | Đồng bộ design system: font serif/sans/mono, token màu giấy `--paper #F3EFE6`, skeleton thuần CSS, không AJAX |
| 4 | "Đổi RBAC: chỉ ADMIN vào `/admin`, STAFF không vào được" | Sửa `src/auth/permissions.ts`, cập nhật test, ẩn link Quản trị với STAFF |

### Giai đoạn 2 — Thẩm mỹ & tương tác (prompt nguyên văn, session hiện tại)

| # | Prompt nguyên văn | Việc AI đã làm |
|---|---|---|
| 5 | `desgin them cho bắt mắt` | Hero tách đôi + ảnh nghiêng + giá nổi, ticker chạy, nút hover tràn màu, card hover nâng, footer wordmark lớn |
| 6 | `thêm dark light theme` | Theme sáng/tối bằng CSS checkbox + biến màu, persist localStorage, knob sun→moon, View Transitions API |
| 7 | `làm hover animation tự nhiên đẹp hơn` | Easing mềm, lift + bóng, nav underline grow, mũi tên `→` trượt |
| 8 | `light dark toggle sửa lại cho animation mượt` | Fix knob nhảy → trượt thật, crescent moon, cross-fade 0.4s |
| 9 | `không zoom ảnh món ăn` | Gỡ toàn bộ `transform:scale()` trên ảnh (card/band/hero/chi tiết/admin thumb) |

### Giai đoạn 3 — Xử lý lỗi thực tế (prompt nguyên văn)

| # | Prompt nguyên văn | Kết quả |
|---|---|---|
| 10 | `Lỗi Database error saving new user tai sao, va hiện có tài khoản nào đăng nhập được` | AI chẩn đoán: Supabase Auth bật Confirm email + SMTP free tier hết quota; xác nhận tài khoản qua service role; chỉ cách tắt Confirm email trên dashboard |
| 11 | `tai sao ko thay skeleton loading` | Tìm ra 2 lỗi: trang public thiếu markup skeleton + overlay admin không có `position:relative`; sửa cả hai |
| 12 | `admin có những lỗi font như là Danh sÃ¡ch mÃ³n, fix tương tự cho toàn bộ web`  | Nguyên nhân: lệnh PowerShell đọc/sai encoding UTF-8; AI viết script phục hồi byte + viết lại view bị hỏng |

### Giai đoạn 4 — Font & hiệu ứng cuối

| # | Prompt nguyên văn | Kết quả |
|---|---|---|
| 13 | `tìm kiếm font có hỗ trợ hoàn toàn tiếng Việt` | Kiểm chứng trực tiếp Google Fonts API: 3 font đang dùng (Fraunces, Be Vietnam Pro, JetBrains Mono) đều có subset `vietnamese`; liệt kê phương án thay thế |
| 14 | `doi toan bo sang font co ho tro tieng viet` | Đổi stack: **Playfair Display** (serif) + **Be Vietnam Pro** (sans) + **IBM Plex Mono** (mono) — đều 100% tiếng Việt |
| 15 | `dòng chữ Mở cửa 09:00 — 22:00... chạy liên tục` | Ticker cuộn vô hạn liền mạch (2 nửa trùng nhau + `translateX(-50%)`), fade 2 đầu |
| 16 | `dòng chữ bị trùng màu với dark theme nên không thấy được, đồng thời làm các hiểu ứng hover nổi bật hơn` | Ticker cố định màu cao contrast ở cả 2 mode; thêm "hover boost": viền accent, gradient band, gạch trên why-item… |
| 17 | `Tạo reponsive cho trang web` | 
| 18 | `Thêm search món ăn và các filter và sort theo tiêu các tiêu chí giá tiền, tên,...` | 
| 19 | `Hiện các món ăn nổi bật trong tuần theo kiểu game character selection có 2 nút qua trái và qua phải kèm theo animation trượt qua trái hoặc qua phải` | 
---

## 2. Phong cách prompt


- **Prompt theo phong cách "yêu cầu + kỳ vọng"**
- **Báo lỗi bằng cách dán thông báo lỗi** (`Database error saving new user`, `Invalid email or password`) — AI tự truy vết nguyên nhân.
- **Prompt đa lớp**: mỗi ý tưởng một prompt, chỉnh dần (design → theme → animation → chi tiết hover).
- **AI được quyền chạy lệnh kiểm chứng**: curl/render test/unit test (`npm test` 9/9 pass) trước khi báo kết quả.

---

## 3. Nguyên tắc làm việc đã áp dụng

1. **Không có AJAX/fetch client** — trang SSR thuần, form GET/POST + CSRF.
2. **Design system tập trung** — một file `style.css` (public) + `admin.css`, token màu/font dùng chung; chuyển theme bằng CSS variables.
3. **Kiểm chứng sau mỗi thay đổi** — render test, `npm test`, request live tới `localhost:3000`.
4. **Sinh viên ra quyết định cuối** — ví dụ: giữ Be Vietnam Pro vì là font thiết kế riêng cho tiếng Việt; chọn mật khẩu; chấp nhận bỏ zoom ảnh.

## 4. Bài học rút ra

- Prompt càng cụ thể về **đầu ra quan sát được** (trang nào, lỗi gì, hành vi mong muốn) thì kết quả càng sát.
- Khi có lỗi, **dùng thử và dán lỗi gốc** (log server, thông báo UI) nhanh hơn mô tả triệu chứng.
- Cần **review lại code của AI** và chạy kiểm thử — AI từng gây ra sự cố encoding do công cụ shell, phải phát hiện và sửa.

---