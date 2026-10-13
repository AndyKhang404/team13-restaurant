# Báo cáo sử dụng AI — Dự án Team 13 Restaurant

- **Tác giả**: Hy Huê Hưng
- **Môn học**: Kiến trúc ứng dụng Web — HCMUS (Năm 3 / Kỳ 1)
- **Dự án**: Team 13 Restaurant SSR Web Application
- **Công cụ AI**: OpenCode + Muse Spark (Meta)
- **Ngày**: 13/10/2026

---

## 1. Tóm tắt

Tài liệu này ghi lại quá trình cộng tác giữa **Hy Huê Hưng** và trợ lý AI trong vai trò vận hành, kiểm thử và hoàn thiện sản phẩm: dựng database qua Supabase MCP, xử lý ảnh món ăn, cấu hình môi trường, chẩn đoán lỗi vận hành, bổ sung tính năng (modal đầu bếp, avatar chuẩn), rà soát và gia cố validation toàn bộ form, kèm kiểm chứng bằng test tự động sau mỗi thay đổi.

Nguyên tắc làm việc xuyên suốt: AI chỉ báo cáo những gì đã thực sự chạy và kiểm tra; mọi thay đổi phá hủy (xóa DB, reset code) đều hỏi xác nhận trước; secret (service key, mật khẩu) không bao giờ đi qua chat. Giữa chừng team rewrite nhánh `main` nên modal/avatar/validation đã phải làm lại trên main mới (xem Giai đoạn 8); các giai đoạn cũ bên dưới giữ nguyên như lịch sử, nhánh feature cũ đã obsolete.

---

## 2. Giai đoạn 1 — Dựng database qua Supabase MCP

**Yêu cầu**: trên project `mjsgkloycpzyhcjdyxwv`, liệt kê tables hiện có, apply lần lượt `supabase/schema.sql` → `supabase/storage.sql` → `supabase/seed.sql`, rồi chạy `supabase/verify.sql` và báo kết quả.

**Việc đã làm**:
1. Liệt kê tables: database trống (`[]`), sau đó apply 3 migration thành công (`apply_schema_sql`, `apply_storage_sql`, `apply_seed_sql`).
2. File `seed.sql` dùng prefix `N'...'` kiểu SQL Server mà Postgres không hỗ trợ, nên đã bỏ prefix (giữ nguyên nội dung Unicode, tương đương ngữ nghĩa) rồi mới apply.
3. Chạy 6 query trong `verify.sql`: 5 chefs / 24 ingredients / 12 dishes / `dish_ingredients` = **32 links** (khác con số 33 trong comment của file — đếm thủ công chỉ có 32 dòng insert, đã báo lại để sửa comment), RLS bật đủ 4 bảng, 3 bucket storage public đầy đủ.

## 3. Giai đoạn 2 — Ảnh thật cho món ăn

**Yêu cầu**: dùng script `scripts/fetch_dish_images.py` (nguồn Wikimedia Commons, miễn phí, không cần key) để gắn ảnh thật cho 12 món.

**Việc đã làm**:
1. `--dry-run`: đủ 12/12, đúng món (phát hiện script đã lọc sẵn ca sai cũ: từ khóa beefsteak từng trả về ảnh nấm).
2. `--emit-sql` sinh `supabase/images_hotlink.sql` rồi apply trực tiếp qua MCP thay vì paste tay; verify `image_url IS NULL` = 0.
3. **Nâng cấp nguồn Openverse** (bản script mới, mặc định `--source openverse`): dry-run 12/12 ảnh ngang ≥1024px hợp card 4:3; 10/12 license thương mại (`by`/`by-sa`/`cc0`), chỉ cơm tấm dính `by-nc-nd` (vẫn dùng được cho đồ án; đã thử `--pick 1/2` nhưng các bản khác cũng NC nên giữ bản mặc định đẹp nhất). Apply đè 12 URL mới, verify đủ.
4. **Sửa riêng ảnh gỏi cuốn** (báo sai ảnh): DB lúc này đã do `seed.ts` mới quản lý (link Unsplash sai món). Liệt kê ứng viên `--pick 1..5`, chọn bản tiêu đề khớp chính xác món nhất — *"Goi Cuon Vietnamese Fresh Spring Rolls With Pork"* (1024×768, kiểm tra tải được HTTP 200 `image/jpeg`) — rồi cập nhật **đồng thời DB và `prisma/seed.ts`** để lần seed sau không bị ghi đè.

## 4. Giai đoạn 3 — Cấu hình môi trường và vận hành

**Việc đã làm**:
1. Điền `.env` những gì lấy được qua MCP: `SUPABASE_URL`, anon key, `CSRF_SECRET` ngẫu nhiên 64 ký tự hex; `DATABASE_URL`/`DIRECT_URL` điền sẵn project-ref, chừa placeholder password/region kèm hướng dẫn lấy trên Dashboard.
2. **Bắt bệnh app không boot**: `.env` bị đổi tên key thành `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` trong khi toàn bộ code lúc đó (`env.ts`, `supabase.ts`, `seed.ts`, tests) yêu cầu `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` → Zod validation fail → `process.exit(1)`. Đã đổi tên key về đúng, app boot được. *(Cập nhật sau: team đã chính thức chuyển code sang tên key mới `PUBLISHABLE/SECRET` kèm fallback tên cũ trong `env.ts`, nên cách đặt tên trong `.env` hiện tại khớp code mà không cần sửa gì thêm.)*
3. Chạy server nền bằng `Start-Process` detached (log ra file), chờ rồi đọc log + probe cổng 3000 để chẩn đoán.
4. Kiểm tra frontend mới: xác nhận `style.css` đã áp dụng, `app.css` rebuild được (`build:css` chạy 141ms không lỗi); `npm run dev` thực ra chạy tốt cả 2 tiến trình (lần tưởng lỗi là do timeout của công cụ gọi lệnh, không phải lỗi app).

## 5. Giai đoạn 4 — Xác minh tài khoản admin

**Yêu cầu**: test trang `/admin` cần đăng nhập admin; tìm tài khoản/mật khẩu.

**Việc đã làm**:
1. Đối chiếu `permissions.ts` (chỉ ADMIN có `admin:access`) với DB: `andykhang404@gmail.com` = ADMIN, `duc.061106@gmail.com` = CUSTOMER (403 khi vào `/admin` là đúng thiết kế).
2. **Chẩn đoán 401**: login gọi thẳng `signInWithPassword` nên 401 là Supabase báo sai mật khẩu. Nguyên nhân: `SEED_ADMIN_PASSWORD=pass` trong `.env` chỉ có hiệu lực lúc seed; user tạo từ 12/10 với mật khẩu lúc đó, vả lại `pass` (4 ký tự) dưới mức tối thiểu 6 ký tự của Supabase nên seed chắc chắn đã dùng mật khẩu khác.
3. Viết sẵn script reset mật khẩu chạy local bằng service-role key, nhận mật khẩu mới qua biến môi trường của chính sinh viên (secret không qua chat), kèm hướng dẫn cập nhật lại `.env` để khỏi nhầm.

## 6. Giai đoạn 5 — Modal đầu bếp + chuẩn hóa avatar

**Yêu cầu (đã gửi kế hoạch và được xác nhận trước khi làm)**: nhấn tên/avatar bếp ở trang món → xem chi tiết bếp; avatar fallback kiểu Facebook; không hardcode; không ảnh hưởng click món ăn.

**Việc đã làm** (theo đúng 3 chốt: modal tại trang món / không show SĐT / giữ badge chữ):
1. Tạo partial tái dùng `views/partials/avatar.hbs`: có URL thì `<img>` tròn đồng nhất kích thước; thiếu thì SVG icon người tối giản trên nền xanh nhạt, cùng kích cỡ/hình dạng.
2. `dish.hbs`: bọc avatar + tên trong nút mở `<dialog>` dùng sẵn object `chef` (không query thêm, không cần loading); modal hiện avatar, chuyên môn, tên, tiểu sử, năm kinh nghiệm; đóng bằng nút ×/click nền/Esc; món không có bếp giữ nguyên ẩn khối.
3. Áp dụng partial vào `admin/chefs/index.hbs` (thay badge chữ "DB") và `form.hbs`; CSS modal + avatar append vào `style.css`/`admin.css` theo đúng pattern `.chef-card` sẵn có.

## 7. Giai đoạn 6 — Sửa form thêm món

**Việc đã làm** (sau khi báo cáo điểm bất hợp lý và được duyệt sửa hết):
1. Thêm `validateIngredientRows` (tái dùng `DishIngredientItemSchema` vốn chết): trùng nguyên liệu → 422 thay vì sập 500 do vi phạm khóa chính; form render lại giữ nguyên dòng lỗi.
2. Form tạo mới chỉ liệt kê bếp/nguyên liệu đang hoạt động (sửa quirk Prisma `undefined` trong `OR` làm lọt đồ đã xóa vào form new).
3. Giá `step="1000"` → `step="any"`, typo "Leaves blank", thêm ô lỗi `chefId`/`ingredients`, `maxlength` khớp backend, dòng mới tự điền đơn vị theo nguyên liệu được chọn.
4. Việt hóa toàn form, tiêu đề route và flash message.

## 8. Giai đoạn 7 — Audit validation toàn form (nhóm A–F, làm sau khi được xác nhận)

| Nhóm | Việc làm |
|---|---|
| A | `paramId` kiểm tra UUID, ID bậy trả 404 thay vì 500 (1 chỗ trung tâm, lợi cả 4 module) |
| B | Rate-limit `POST /login` + `/register` (20 req/phút/IP, quá thì render lại form với 429) |
| C | File vượt trần multer (>5MB) redirect kèm flash thay vì trang 500 (đổi thứ tự `flash` trước `multipart`) |
| D | Form bếp: SĐT pattern VN, kinh nghiệm 0–100, sửa 3 bug template (`? Back`, placeholder sai ô tên, mojibake), `maxlength`, Việt hóa |
| E | Form nguyên liệu: chặn trùng tên hoa/thường (unique DB phân biệt hoa thường), gợi ý unit qua `datalist`, Việt hóa |
| F | Register: tên trắng thành null, `minlength=8` ở client, message zod tiếng Việt |

## 9. Giai đoạn 8 — Làm lại trên main mới của team

**Bối cảnh**: khi pull `main` về thì phát hiện team đã rewrite lớn (form 3 module viết lại gọn ~488 dòng, `seed.ts` chuyển sang ảnh Unsplash, `env.ts` đổi tên key, tests về 3 files) — toàn bộ việc ở Giai đoạn 5–7 nằm trên nhánh cũ, chưa có trên main. Quyết định: implement lại sạch trên main thay vì rebase (form đã khác hẳn), nhánh `feat/form-validation-chef-modal` ghi nhận obsolete.

**Việc đã làm**:
1. **Modal + avatar làm lại** (kế hoạch gửi trước, xác nhận rồi mới làm; chốt giữ nguyên: modal tại trang món / không show SĐT / giữ badge chữ): partial `avatar.hbs` mới, `dish.hbs` bọc avatar + tên thành nút mở `<dialog>`, admin dùng partial (thay badge "DB"), CSS append vào `style.css`/`admin.css`. Kiểm tra phát hiện file trên main không hề có mojibake như tưởng ban đầu (dòng `?nh hi?n t?i` chỉ là lỗi hiển thị encoding của công cụ đọc, nội dung file vẫn đúng) — đã xác minh bằng đọc trực tiếp thay vì kết luận vội.
2. **Audit validation làm lại** (kế hoạch A–H gửi trước, xác nhận rồi mới làm): `paramId` → 404, rate-limit login/register, file quá cỡ redirect kèm flash, form món (validate + dedupe dòng, ô lỗi `chefId`/`ingredients`, giá `step="any"`, `maxlength`, tự điền đơn vị, ẩn đồ đã xóa ở form new), form bếp (SĐT pattern VN, kinh nghiệm 0–100), form nguyên liệu (chặn trùng hoa/thường, `datalist` đơn vị), register (đồng bộ hint min 6 + `minlength`, tên trắng thành null), Việt hóa nhãn zod/tiêu đề/flash còn tiếng Anh. Template team đã Việt hóa sẵn nên không đụng.
3. **Đối chiếu yêu cầu `docs/YC.html`**: file này là slide bài giảng tuần 3 (dữ liệu minh họa, stack EJS), không phải spec đồ án — ví dụ `dishes/2` chỉ minh họa khái niệm path param. Web dùng `/dishes/:slug` giữ nguyên mọi tính chất yêu cầu (link mang định danh, reload/share đúng món) cộng SEO tiếng Việt; verify live: slug → 200, slug lạ → 404, `/dishes/2` → 404 đúng thiết kế, tìm kiếm query → 200, mutation chỉ dùng POST + CSRF.
4. **Quy trình git**: hướng dẫn tạo nhánh/PR/description (chỉ gợi ý lệnh, sinh viên tự chạy); các lần pull `main` đều stash work chưa commit trước để không mất code, pop lại sạch không conflict; sau pull xác nhận worktree khớp `origin/main`.

## 10. Kiểm chứng và kết quả

```bash
npm run test
# 7 files passed, 27/27 tests sau khi làm lại trên main mới
# (3 file gốc + admin-id, rate-limit, chef-validation, dish-ingredients)
npm run typecheck
# tsc --noEmit, 0 lỗi
```

- Render template với dữ liệu mẫu trên main mới: modal/avatar 16/16; form món/bếp/nguyên-liệu/register 15/15 (1 check fail giữa chừng đã xác minh là do test thiếu dữ liệu `ingredients`, code đúng khi render đủ dữ liệu).
- Boot `dev:server`: home/menu/login/register/dish đều HTTP 200; modal, fallback avatar, CSS mới serve đầy đủ; không rò SĐT; link món ăn nguyên vẹn.

## 11. Giới hạn kiểm chứng và bài học

1. **Chưa submit form admin trên trình duyệt thật** (tài khoản admin lỗi 401 tại thời điểm làm) — các case trùng nguyên liệu, trùng tên hoa/thường, rate-limit tay, upload >5MB tay cần QA bổ sung sau khi đăng nhập được.
2. Rate-limit và trùng hoa/thường mới chỉ được chứng minh bằng unit test, chưa thử tay end-to-end.
3. Tương tác modal (click/Esc/backdrop) mới kiểm chứng ở mức markup + JS hiện diện + HTML live, chưa click tự động.
4. Kết luận về file (như vụ mojibake ở Giai đoạn 8) phải dựa trên đọc trực tiếp nội dung, không dựa trên output hiển thị của công cụ — output có thể bị lỗi encoding.
5. Bài học chung: validate phải chạy ở cả ba lớp (client gợi ý → server 422 thân thiện → DB là lưới cuối); mọi con số báo cáo đều phải từ lệnh đã chạy, không từ suy đoán — các lần "tưởng lỗi" trong quá trình làm (timeout tool, quoting PowerShell, test thiếu dữ liệu) đều là lỗi của công cụ kiểm tra chứ không phải của app.
