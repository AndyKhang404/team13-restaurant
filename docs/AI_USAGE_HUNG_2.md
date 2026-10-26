# Báo cáo sử dụng AI (Phần 2) — Vòng Kiểm thử Backend & QA với OpenCode

- **Tác giả**: Hy Huê Hưng
- **Môn học**: Kiến trúc ứng dụng Web — HCMUS (Năm 3 / Kỳ 1)
- **Dự án**: Team 13 Restaurant — nhánh `feat/csr` (React CSR + Express 5 REST API)
- **Công cụ AI**: OpenCode
- **Ngày**: 19/10/2026
- **Phần 1**: `AI_USAGE_HUNG.md` (dựng DB, ảnh, validation thời SSR)

---

## 1. Tóm tắt

Tài liệu này ghi lại các **workflow làm việc với AI** trong giai đoạn kiểm thử backend của dự án sau khi chuyển CSR: đối chiếu code với đề bài, chạy kiểm thử black-box 2 vòng (trước/sau fix CORS), và dọn dẹp dữ liệu test trên database. Kết quả là 2 bộ báo cáo QA đầy đủ (`reports/backend-testing/` và `reports/backend-testing/postfix/`), mỗi bộ 3 file (báo cáo, test case, execution log).

Nguyên tắc xuyên suốt: **AI chỉ ghi nhận những gì đã thực sự chạy** — mọi verdict đều có request/response thật trong log; **hỏi xác nhận trước mỗi quyết định có ảnh hưởng** (mức độ ghi DB, vị trí báo cáo, thao tác hard-delete); **không commit/push**; mật khẩu/secret mask trong mọi file công khai.

---

## 2. Workflow 1 — Đối chiếu code với đề bài (QA review)

**Yêu cầu**: Đọc file yêu cầu `docs/REST API và SPA.html`, đóng vai QA review backend hiện tại (code của thành viên khác trên nhánh `feat/csr`), chỉ ra chỗ nào khớp/không khớp đề bài. Không sửa code.

**Việc đã làm**:
1. Đọc cấu trúc dự án (Express 5 + Prisma 7 + Supabase, SPA Vite/React trong `src/client/`), xác định endpoint surface, cách khởi động.
2. Chạy `typecheck` + `lint` + `test` (phát hiện `node_modules` thiếu package SPA → `npm install` → 33 unit test pass).
3. Đối chiếu từng mục với bảng nghiệm thu đề bài, phát hiện các lệch lớn:
   - **Không có CORS** (grep `Access-Control-Allow-Origin` = 0) — project né bằng Vite proxy + serve cùng origin;
   - Business error trả **HTTP 4xx** thay vì `200 {ok:false}`;
   - Tên code lệch (`VALIDATION_ERROR` vs `VALIDATION_FAILED`, `CONFLICT` vs `ALREADY_EXISTS`);
   - CRUD nằm dưới `/api/admin/*` thay vì `/api/dishes`...;
   - **CSRF bắt buộc mọi POST** → curl nghiệm thu không token sẽ 403 hết;
   - `loadUser` upsert Profile → GET có thể ghi DB.
4. Trình bày phân loại: mục Đúng/Tốt vs Lệch nghiêm trọng kèm file:dòng, để người dùng quyết định hướng xử lý.

**Kết quả**: Báo cáo review bằng chat (không file) — thành viên code đã nhận và fix nhóm CORS trong commit `709d9ec`.

---

## 3. Workflow 2 — QA test backend vòng 1 (baseline)

**Yêu cầu (hỏi xác nhận trước khi làm)**: Chạy test backend thực tế, không bịa kết quả, không sửa code, ghi báo cáo vào `reports/backend-testing/` gồm 3 file.

**Chốt với người dùng trước khi chạy**:
- Mức độ ghi DB: **được tạo + soft-delete** dữ liệu test `QA-TEST-*` (không hard-delete);
- Tài khoản admin: dùng credentials do người dùng cung cấp (mask trong mọi file).

**Việc đã làm**:
1. Viết script `run_tests.sh` chạy curl thật với cookie jar + CSRF token, mỗi case log `Request/Status/Response/Verdict` vào `execution_log.txt`.
2. Chạy server thật trên `:3000`, chạy **73 test case**: public API, CSRF, auth (login/register/logout), phân quyền, CRUD dishes/ingredients/chefs/users, validation, toàn vẹn dữ liệu (slug suffix, soft-delete ẩn public), rate limit.
3. Kết quả vòng 1: **70 PASS / 2 FAIL / 1 BLOCKED**. 2 FAIL đều là CORS (thiếu header ACAO, preflight thiếu `Allow-Methods`) — tôi đã **chạy lại curl spot-check tại chỗ** để xác nhận FAIL là thật, không phải lỗi harness.
4. Dọn dẹp soft-delete 4 records QA trong script; đối chiếu số liệu báo cáo ↔ test_cases ↔ log (`SUMMARY: PASS=69...` + supplemental) khớp nhau.
5. Ghi nhận BLOCKED trung thực: F01 không test được 403 vì Supabase yêu cầu xác nhận email.

**Kết quả**: `reports/backend-testing/` (4 file: `backend_test_report.md`, `test_cases.md`, `execution_log.txt`, `run_tests.sh`).

---

## 4. Workflow 3 — Re-test backend vòng 2 (postfix, sau CORS fix)

**Yêu cầu**: Code đã chỉnh sửa (commit CORS), test lại theo đúng quy trình vòng 1, ghi **báo cáo mới**. Hỏi xác nhận trước khi làm.

**Chốt với người dùng**: báo cáo mới vào thư mục con `reports/backend-testing/postfix/` (giữ baseline để so before/after); chạy **full 73 case + bổ sung case CORS negative**.

**Việc đã làm**:
1. Xác minh thay đổi qua `git diff`: middleware `cors` + env `CORS_ORIGIN` + `credentials:'include'` + `tests/cors.test.ts` → chạy lại typecheck/lint/test (**36/36 pass**).
2. Restart server với code HEAD mới, chạy lại full suite.
3. **Sự cố trung thực (ghi vào báo cáo)**: lần chạy đầu gọi nhầm WSL bash → `node: command not found` → toàn bộ HTTP 000 (`PASS=1 FAIL=55` — **không tính**). Khắc phục: `git checkout` khôi phục log baseline, chạy lại bằng Git Bash, cắt phần rác khỏi log.
4. Chạy bổ sung `supplemental.sh`: CORS03 (origin lạ `evil.example.com` bị từ chối — không phát ACAO), CORS04 (request không Origin vẫn 200), U05 roundtrip role, retry F01.
5. Kết quả vòng 2: **75 case — 74 PASS / 0 FAIL / 1 BLOCKED**; CORS01/02 từ FAIL → PASS, không có FAIL mới; 0 response HTTP 500 trong `server.log`.
6. Đối chiếu Before/After với baseline và các mục lệch chuẩn đề bài còn giữ nguyên (4xx, CSRF, tên code...) — ghi thành mục riêng, không tự sửa code.

**Kết quả**: `reports/backend-testing/postfix/` (3 file báo cáo + script tái lập).

---

## 5. Workflow 4 — Dọn dẹp dữ liệu test trên database

**Yêu cầu**: Các vòng test trước để lại `QA Test *` trong DB — truy tìm và dọn sạch.

**Việc đã làm** (theo nguyên tắc: **đọc trước, hỏi xác nhận, rồi mới xóa**):
1. Viết `qa-scan.ts` — query read-only trước khi xóa: 8 dish, 4 ingredient, 4 chef (đều đã soft-delete), 0 link `DishIngredient`, 3 profile `qa.test.*` + 3 Supabase Auth user tương ứng.
2. **Hỏi xác nhận phạm vi** (hard-delete tất cả / chỉ xóa user / bỏ qua) → được chọn hard-delete toàn bộ.
3. Viết `qa-cleanup.ts`: xóa theo thứ tự FK (`dishIngredient` → `dish` → `ingredient` → `chef` → `profile`), kiểm tra mọi tham chiếu QA-chef trước khi xóa, rồi `supabase.auth.admin.deleteUser` cho 3 auth user (chạy local bằng service key, key không qua chat).
4. **Verify độc lập 2 lần**: script cleanup tự đếm lại + chạy lại `qa-scan.ts` mới → **dish:0 ingredient:0 chef:0 profile:0**.
5. Ghi toàn bộ biến thiên vào `execution_log.txt` để báo cáo và log khớp nhau.

---

## 6. Các pattern làm việc đã dùng

| Workflow | Pattern |
|---|---|
| Review code | Đọc yêu cầu → grep/đọc code → phân loại Đúng/Lệch kèm dẫn chứng `file:dòng` → để người dùng quyết định, không sửa khi chưa được yêu cầu |
| QA test | Lên plan → **hỏi xác nhận** (phạm vi, tài khoản) → chạy thật → log evidence từng case → đối chiếu số liệu 3 chiều (báo cáo ↔ test cases ↔ log) → spot-check lại FAIL |
| Re-test | `git diff` xác minh đúng thay đổi → giữ baseline, báo cáo vòng mới vào thư mục riêng → ghi trung thực cả sự cố run sai |
| Dọn dữ liệu | Scan read-only → hiện số liệu → **xác nhận trước khi xóa** → xóa theo thứ tự FK → verify lại bằng scan độc lập |
| An toàn | Không commit/push; mask mật khẩu trong script/báo cáo; secret chỉ đọc từ `.env` local; cookie jar tạm dọn sau test |

---

## 7. Kết quả tổng hợp

| Vòng | Case | PASS | FAIL | BLOCKED | Vị trí |
|---|---|---|---|---|---|
| Baseline (trước fix) | 73 | 70 | 2 (CORS) | 1 (F01) | `reports/backend-testing/` |
| Postfix (sau fix) | 75 | 74 | **0** | 1 (F01) | `reports/backend-testing/postfix/` |
| Dọn DB | — | 16 rows + 3 profile + 3 auth user xóa sạch, verify 0 | — | — | `postfix/qa-scan.ts`, `qa-cleanup.ts` |

Các file gợi ý không push: `postfix/run_tests.sh` (hardcode mật khẩu admin — chuyển sang biến môi trường trước khi commit).
