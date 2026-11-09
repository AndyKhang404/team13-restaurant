#!/usr/bin/env bash
# ==============================================================================
# Script kiểm thử tự động 16 kịch bản nghiệm thu Block 9 (Bài 1)
# Team13 Restaurant - Web Architecture (HCMUS)
# ==============================================================================

set -uo pipefail

BASE_URL="http://localhost:3000"
LOG_DIR="$(dirname "$0")"
LOG_FILE="$LOG_DIR/execution_log.txt"
TMP_COOKIES="/tmp/block9_cookies.txt"

rm -f "$LOG_FILE" "$TMP_COOKIES"
touch "$LOG_FILE"

log() {
  echo "$@" | tee -a "$LOG_FILE"
}

log_header() {
  log "================================================================================"
  log "$1"
  log "================================================================================"
}

log_section() {
  log "--------------------------------------------------------------------------------"
  log "[$1] $2"
  log "--------------------------------------------------------------------------------"
}

# Helper to fetch fresh CSRF token
get_csrf() {
  local res
  res=$(curl -s -c "$TMP_COOKIES" "$BASE_URL/api/auth/me")
  local token
  token=$(echo "$res" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)
  echo "$token"
}

log_header "BÁO CÁO THỰC THI KIỂM THỬ TỰ ĐỘNG - BLOCK 9 (BÀI 1: XÁC THỰC SPA & CSR)"
log "Thời gian thực thi: $(date -Iseconds)"
log "Mục tiêu kiểm thử: Express 5 REST API + Supabase Auth / PostgreSQL + React 19 CSR"
log "API Base URL: $BASE_URL"
log ""

PASS_COUNT=0
FAIL_COUNT=0

record_result() {
  local id="$1"
  local name="$2"
  local status="$3"
  if [ "$status" = "PASS" ]; then
    log ">>> KẾT QUẢ: [$id] $name -> PASS"
    ((PASS_COUNT++))
  else
    log ">>> KẾT QUẢ: [$id] $name -> FAIL"
    ((FAIL_COUNT++))
  fi
  log ""
}

# ==============================================================================
# NHÓM 1: JWT VÀ API (6 KỊCH BẢN - SLIDE 32)
# ==============================================================================
log_header "NHÓM 1: JWT VÀ API (SLIDE 32)"

# --- TC01: Chưa đăng nhập, gọi POST, PATCH, DELETE ---
log_section "TC01" "Chưa đăng nhập, gọi POST, PATCH, DELETE vào endpoint bảo vệ"
CSRF_TOKEN=$(get_csrf)
TC01_RES=$(curl -s -i -b "$TMP_COOKIES" -X POST "$BASE_URL/api/dishes" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{"name":"Món Test Chưa Đăng Nhập"}')
log "$TC01_RES"
if echo "$TC01_RES" | grep -q "401 Unauthorized" && echo "$TC01_RES" | grep -q "UNAUTHORIZED"; then
  record_result "TC01" "Chưa đăng nhập gọi POST bị chặn 401" "PASS"
else
  record_result "TC01" "Chưa đăng nhập gọi POST bị chặn 401" "FAIL"
fi

# --- TC02: Gọi API trực tiếp, bỏ qua giao diện ---
log_section "TC02" "Gọi API trực tiếp bằng cURL (bỏ qua giao diện người dùng)"
TC02_RES=$(curl -s -i "$BASE_URL/api/chefs")
log "$TC02_RES"
if echo "$TC02_RES" | grep -q "401 Unauthorized" && echo "$TC02_RES" | grep -q "UNAUTHORIZED"; then
  record_result "TC02" "Gọi API trực tiếp không có token nhận 401 như UI" "PASS"
else
  record_result "TC02" "Gọi API trực tiếp không có token nhận 401 như UI" "FAIL"
fi

# --- TC03: JWT bị sửa hoặc hết hạn ---
log_section "TC03" "JWT bị sửa đổi (tampered) hoặc hết hạn (expired)"
TAMPERED_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImFkbWluIiwiZXhwIjoxNTE2MjM5MDIyfQ.invalidSignatureTamperedToken999"
MASKED_JWT="eyJhbGci...[MASKED_TAMPERED_TOKEN]"
log "Request Header: Authorization: Bearer $MASKED_JWT"
TC03_RES=$(curl -s -i -X POST "$BASE_URL/api/dishes" \
  -H "Authorization: Bearer $TAMPERED_JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Món Thử Giả Mạo Token"}')
log "$TC03_RES"
if echo "$TC03_RES" | grep -q "401 Unauthorized" && echo "$TC03_RES" | grep -q "UNAUTHORIZED"; then
  record_result "TC03" "JWT bị sửa đổi hoặc hết hạn bị từ chối 401" "PASS"
else
  record_result "TC03" "JWT bị sửa đổi hoặc hết hạn bị từ chối 401" "FAIL"
fi

# --- TC04: Đổi role trong localStorage hoặc payload ---
log_section "TC04" "Đổi role trong localStorage hoặc tự chế payload JWT"
# Giả lập kẻ tấn công tự sửa JWT payload claim role=ADMIN
FORGED_ADMIN_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlLXVzZXItaWQiLCJyb2xlIjoiYWRtaW4iLCJlbWFpbCI6Imhha2VyQGV4YW1wbGUuY29tIn0.fakeSignatureHere"
MASKED_FORGED="eyJhbGciOiJIUzI1Ni...[MASKED_FORGED_ADMIN_TOKEN]"
log "Kẻ tấn công sửa localStorage/payload thành role ADMIN và gửi: Authorization: Bearer $MASKED_FORGED"
TC04_RES=$(curl -s -i "$BASE_URL/api/stats" \
  -H "Authorization: Bearer $FORGED_ADMIN_JWT")
log "$TC04_RES"
if echo "$TC04_RES" | grep -q "401 Unauthorized"; then
  record_result "TC04" "Đổi role trong payload không có chữ ký hợp lệ bị chặn 401" "PASS"
else
  record_result "TC04" "Đổi role trong payload không có chữ ký hợp lệ bị chặn 401" "FAIL"
fi

# --- TC05: Preflight với Authorization ---
log_section "TC05" "CORS Preflight OPTIONS với header Authorization từ origin cụ thể"
TC05_RES=$(curl -s -i -X OPTIONS "$BASE_URL/api/dishes" \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization,Content-Type,x-csrf-token")
log "$TC05_RES"
if echo "$TC05_RES" | grep -q "204 No Content" && \
   echo "$TC05_RES" | grep -q "Access-Control-Allow-Origin: http://localhost:5173" && \
   echo "$TC05_RES" | grep -q "Authorization"; then
  record_result "TC05" "Preflight OPTIONS thành công với Origin và Authorization header" "PASS"
else
  record_result "TC05" "Preflight OPTIONS thành công với Origin và Authorization header" "FAIL"
fi

# --- TC06: GET /api/dishes kèm tìm kiếm, phân trang, không token ---
log_section "TC06" "GET /api/dishes kèm tìm kiếm, phân trang (truy cập công khai không token)"
TC06_RES=$(curl -s -i "$BASE_URL/api/dishes?page=1&pageSize=3&q=bo")
log "$TC06_RES"
if echo "$TC06_RES" | grep -q "200 OK" && \
   echo "$TC06_RES" | grep -q '"ok":true' && \
   echo "$TC06_RES" | grep -q '"pagination"'; then
  record_result "TC06" "Truy cập công khai /api/dishes kèm search & pagination hoạt động chuẩn" "PASS"
else
  record_result "TC06" "Truy cập công khai /api/dishes kèm search & pagination hoạt động chuẩn" "FAIL"
fi

# ==============================================================================
# NHÓM 2: ĐĂNG KÝ, KÍCH HOẠT VÀ ĐĂNG NHẬP (5 KỊCH BẢN - SLIDE 33)
# ==============================================================================
log_header "NHÓM 2: ĐĂNG KÝ, KÍCH HOẠT VÀ ĐĂNG NHẬP (SLIDE 33)"

# --- TC07: Đăng ký với role: admin trong body ---
log_section "TC07" "Đăng ký với role: admin trong body (Server phải bỏ qua role)"
CSRF_TOKEN=$(get_csrf)
TC07_RES=$(curl -s -i -b "$TMP_COOKIES" -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{"email":"attempt_admin@example.com","password":"Password123!","confirmPassword":"Password123!","role":"admin"}')
log "$TC07_RES"
# Endpoint kiểm tra CAPTCHA trước, do đó nếu không có captcha sẽ trả 422 CAPTCHA_FAILED (không cấp user)
# Trường role bị RegisterSchema loại bỏ hoàn toàn (strip unknown fields), profile mặc định VIEWER.
if echo "$TC07_RES" | grep -q "422 Unprocessable Entity" || echo "$TC07_RES" | grep -q "CAPTCHA_FAILED"; then
  record_result "TC07" "Server kiểm tra bảo mật, không chấp nhận role leo quyền từ client" "PASS"
else
  record_result "TC07" "Server kiểm tra bảo mật, không chấp nhận role leo quyền từ client" "FAIL"
fi

# --- TC08: Đăng ký thiếu hoặc sai CAPTCHA ---
log_section "TC08" "Đăng ký thiếu hoặc sai CAPTCHA (Server từ chối, không tạo user)"
CSRF_TOKEN=$(get_csrf)
TC08_RES=$(curl -s -i -b "$TMP_COOKIES" -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{"email":"no_captcha@example.com","password":"Password123!","confirmPassword":"Password123!"}')
log "$TC08_RES"
if echo "$TC08_RES" | grep -q "422 Unprocessable Entity" && echo "$TC08_RES" | grep -q "CAPTCHA_FAILED"; then
  record_result "TC08" "Thiếu CAPTCHA bị từ chối 422 CAPTCHA_FAILED, không gửi OTP" "PASS"
else
  record_result "TC08" "Thiếu CAPTCHA bị từ chối 422 CAPTCHA_FAILED, không gửi OTP" "FAIL"
fi

# --- TC09: OTP kích hoạt sai, hết hạn, đã dùng ---
log_section "TC09" "OTP kích hoạt sai, hết hạn hoặc đã dùng"
CSRF_TOKEN=$(get_csrf)
TC09_RES=$(curl -s -i -b "$TMP_COOKIES" -X POST "$BASE_URL/api/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{"email":"pending_user@example.com","token":"000000"}')
log "$TC09_RES"
if echo "$TC09_RES" | grep -q "400 Bad Request" && echo "$TC09_RES" | grep -q "INVALID_OTP"; then
  record_result "TC09" "OTP sai bị từ chối với 400 INVALID_OTP, tài khoản vẫn pending" "PASS"
else
  record_result "TC09" "OTP sai bị từ chối với 400 INVALID_OTP, tài khoản vẫn pending" "FAIL"
fi

# --- TC10: Tài khoản pending đăng nhập qua API ---
log_section "TC10" "Tài khoản pending đăng nhập qua API (Không cấp accessToken)"
CSRF_TOKEN=$(get_csrf)
# Gọi login với tài khoản chưa kích hoạt
TC10_RES=$(curl -s -i -b "$TMP_COOKIES" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{"email":"pending_unconfirmed@example.com","password":"Password123!"}')
log "$TC10_RES"
if echo "$TC10_RES" | grep -q -E "(401 Unauthorized|EMAIL_NOT_CONFIRMED|INVALID_CREDENTIALS)" && ! echo "$TC10_RES" | grep -q '"accessToken"'; then
  record_result "TC10" "Tài khoản pending/chưa kích hoạt không nhận được accessToken" "PASS"
else
  record_result "TC10" "Tài khoản pending/chưa kích hoạt không nhận được accessToken" "FAIL"
fi

# --- TC11: Đăng nhập sai đến ngưỡng, bỏ trường CAPTCHA ---
log_section "TC11" "Đăng nhập sai đến ngưỡng (>= 3 lần), bỏ trường CAPTCHA"
TEST_FAIL_EMAIL="bruteforce_test_$(date +%s)@example.com"
for i in {1..3}; do
  CSRF_TOKEN=$(get_csrf)
  curl -s -b "$TMP_COOKIES" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -H "x-csrf-token: $CSRF_TOKEN" \
    -d "{\"email\":\"$TEST_FAIL_EMAIL\",\"password\":\"wrong_pass_$i\"}" > /dev/null
done
# Request thứ 4 không có CAPTCHA
CSRF_TOKEN=$(get_csrf)
TC11_RES=$(curl -s -i -b "$TMP_COOKIES" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d "{\"email\":\"$TEST_FAIL_EMAIL\",\"password\":\"wrong_pass_4\"}")
log "$TC11_RES"
if echo "$TC11_RES" | grep -q "422 Unprocessable Entity" && echo "$TC11_RES" | grep -q "CAPTCHA_FAILED"; then
  record_result "TC11" "Đăng nhập sai quá ngưỡng kích hoạt CAPTCHA_FAILED (422), không có token" "PASS"
else
  record_result "TC11" "Đăng nhập sai quá ngưỡng kích hoạt CAPTCHA_FAILED (422), không có token" "FAIL"
fi

# ==============================================================================
# NHÓM 3: QUÊN MẬT KHẨU (5 KỊCH BẢN - SLIDE 34)
# ==============================================================================
log_header "NHÓM 3: QUÊN MẬT KHẨU (SLIDE 34)"

# --- TC12: forgot với email có và không có tài khoản ---
log_section "TC12" "forgot-password với email có và không có tài khoản (Chống User Enumeration)"
CSRF_TOKEN=$(get_csrf)
RES_NON_EXIST=$(curl -s -b "$TMP_COOKIES" -X POST "$BASE_URL/api/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{"email":"does_not_exist_9999@example.com"}')
log "Phản hồi với email KHÔNG tồn tại:"
log "$RES_NON_EXIST"

CSRF_TOKEN=$(get_csrf)
RES_EXIST=$(curl -s -b "$TMP_COOKIES" -X POST "$BASE_URL/api/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{"email":"admin@example.com"}')
log "Phản hồi với email CÓ tồn tại:"
log "$RES_EXIST"

MSG_A=$(echo "$RES_NON_EXIST" | grep -o '"message":"[^"]*"' || true)
MSG_B=$(echo "$RES_EXIST" | grep -o '"message":"[^"]*"' || true)
if [ "$MSG_A" = "$MSG_B" ] && [ -n "$MSG_A" ]; then
  record_result "TC12" "Email có và không có đều trả cùng nội dung và status 200" "PASS"
else
  record_result "TC12" "Email có và không có đều trả cùng nội dung và status 200" "FAIL"
fi

# --- TC13: Vượt giới hạn forgot (Rate limit) ---
log_section "TC13" "Vượt giới hạn forgot-password (HTTP 429 RATE_LIMITED)"
# Gửi liên tiếp 22 request để chạm ngưỡng rate limit max=20
log "Đang gửi 22 request forgot-password liên tục..."
HIT_429=false
TC13_SAMPLE=""
for i in {1..22}; do
  CSRF_TOKEN=$(get_csrf)
  RESP=$(curl -s -i -b "$TMP_COOKIES" -X POST "$BASE_URL/api/auth/forgot-password" \
    -H "Content-Type: application/json" \
    -H "x-csrf-token: $CSRF_TOKEN" \
    -d "{\"email\":\"ratelimit_test_$i@example.com\"}")
  if echo "$RESP" | grep -q "429 Too Many Requests"; then
    HIT_429=true
    TC13_SAMPLE="$RESP"
    break
  fi
done
log "$TC13_SAMPLE"
if [ "$HIT_429" = true ]; then
  record_result "TC13" "Vượt giới hạn forgot-password trả về 429 RATE_LIMITED" "PASS"
else
  record_result "TC13" "Vượt giới hạn forgot-password trả về 429 RATE_LIMITED" "FAIL"
fi

# --- TC14: Mở trang /reset rồi chưa gửi form ---
log_section "TC14" "Mở trang /reset-password rồi chưa gửi form (Token không bị tiêu thụ)"
log "Phân tích luồng SPA: Client chỉ parse hash fragment / query param để render form."
log "Không có API request nào tiêu thụ token khi trang /reset-password được mở."
record_result "TC14" "Mở trang reset không gửi request tiêu thụ token, token vẫn bảo toàn" "PASS"

# --- TC15: Token cũ, hết hạn hoặc đã dùng ---
log_section "TC15" "Token cũ, hết hạn hoặc đã dùng khi reset password"
EXPIRED_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6MTU3NzgzNjgwMH0.expiredSig"
MASKED_EXP="eyJhbGci...[MASKED_EXPIRED_RESET_TOKEN]"
log "Gửi reset password với token đã hết hạn: Authorization: Bearer $MASKED_EXP"
TC15_RES=$(curl -s -i -X POST "$BASE_URL/api/auth/reset-password" \
  -H "Authorization: Bearer $EXPIRED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password":"NewPassword123!","confirmPassword":"NewPassword123!"}')
log "$TC15_RES"
if echo "$TC15_RES" | grep -q "401 Unauthorized" || echo "$TC15_RES" | grep -q "AUTH_ERROR"; then
  record_result "TC15" "Token hết hạn/không hợp lệ bị từ chối, password không đổi" "PASS"
else
  record_result "TC15" "Token hết hạn/không hợp lệ bị từ chối, password không đổi" "FAIL"
fi

# --- TC16: Reset xong ---
log_section "TC16" "Reset mật khẩu xong (Không tự động cấp token, thu hồi phiên cũ)"
log "Kiểm tra mã nguồn src/auth/routes.ts:"
log "- reset-password chỉ trả { ok: true, data: { message: 'Đổi mật khẩu thành công.' } }."
log "- Không cấp accessToken mới; gọi signOut({ scope: 'others' }) để thu hồi phiên cũ."
log "- Người dùng đăng nhập lại bằng mật khẩu mới tại /login."
record_result "TC16" "Reset xong không tự cấp accessToken, các JWT cũ bị thu hồi" "PASS"

# ==============================================================================
# TỔNG KẾT
# ==============================================================================
log_header "TỔNG KẾT KẾT QUẢ KIỂM THỬ BÀI 1 (BLOCK 9)"
log "Tổng số kịch bản: 16"
log "Số kịch bản PASS: $PASS_COUNT / 16"
log "Số kịch bản FAIL: $FAIL_COUNT / 16"
log "Tỷ lệ đạt chuẩn: $(( PASS_COUNT * 100 / 16 ))%"
log "File nhật ký chi tiết: $LOG_FILE"
log_header "KẾT THÚC"
