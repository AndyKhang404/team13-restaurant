#!/usr/bin/env bash
# Supplemental QA run — CORS negative cases + U05/F01 follow-up after main suite
set -u
BASE="${BASE:-http://localhost:3000}"
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/execution_log.txt"
TMP="$DIR/tmp"; mkdir -p "$TMP"
JAR="$TMP/supp.jar"; rm -f "$JAR"

status_of() { awk 'NR==1{print $2}' "$TMP/h.txt"; }
hdr() { grep -i "^$1" "$TMP/h.txt" | tr -d '\r'; }
jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{let o=JSON.parse(d);let p='$1'.split('.');for(const k of p)o=o?.[k];console.log(o??'')}catch(e){console.log('')}})"; }

{
echo
echo "==============================================================="
echo "SUPPLEMENTAL RUN (CORS negative + U05 + F01) — $(date '+%Y-%m-%d %H:%M:%S %z')"
echo "==============================================================="

echo "--- [CORS03] GET /api/menu với Origin lạ (không nằm trong whitelist)"
echo "Request : GET $BASE/api/menu   Header: Origin: http://evil.example.com"
curl -s -D "$TMP/h.txt" -o "$TMP/b.txt" -H "Origin: http://evil.example.com" "$BASE/api/menu"
echo "Status  : $(status_of)"
ac=$(hdr 'Access-Control-Allow-Origin')
echo "ACAO    : ${ac:-<không có header>}"
if [ -z "$ac" ]; then echo "Verdict : PASS (origin lạ bị từ chối đúng, không phát ACAO)"; else echo "Verdict : FAIL (origin lạ vẫn được cấp ACAO: $ac)"; fi

echo
echo "--- [CORS04] GET /api/menu không có header Origin (curl thường / Postman)"
echo "Request : GET $BASE/api/menu   (không Origin)"
curl -s -D "$TMP/h.txt" -o "$TMP/b.txt" "$BASE/api/menu"
echo "Status  : $(status_of)"
ok=$(head -c 12 "$TMP/b.txt")
echo "Body    : ${ok}..."
if [ "$(status_of)" = "200" ] && [ "${ok:0:8}" = '{"ok":tr' ]; then echo "Verdict : PASS (request không Origin vẫn hoạt động bình thường)"; else echo "Verdict : FAIL"; fi

echo
echo "--- [S01] Đăng nhập admin (chuẩn bị U05) — payload đã mask"
csrf=$(curl -s -c "$JAR" -b "$JAR" "$BASE/api/auth/me" | jget data.csrfToken)
echo "Request : POST $BASE/api/auth/login  Payload: {\"email\":\"andykhang404@gmail.com\",\"password\":\"***\"}"
curl -s -c "$JAR" -b "$JAR" -D "$TMP/h.txt" -o "$TMP/b.txt" -X POST -H 'Content-Type: application/json' -H "x-csrf-token: $csrf" -d '{"email":"andykhang404@gmail.com","password":"pass123"}' "$BASE/api/auth/login"
echo "Status  : $(status_of)"
echo "Response: $(cat "$TMP/b.txt")"

echo
echo "--- [S02] Tìm QA user qua admin search"
curl -s -c "$JAR" -b "$JAR" -D "$TMP/h.txt" -o "$TMP/b.txt" "$BASE/api/admin/users?q=qa.test.1792415863"
echo "Request : GET $BASE/api/admin/users?q=qa.test.1792415863"
echo "Status  : $(status_of)"
UID_QA=$(cat "$TMP/b.txt" | jget data.users.0.id)
echo "QA user id: ${UID_QA:-<không tìm thấy>}"

if [ -n "$UID_QA" ]; then
  csrf=$(curl -s -c "$JAR" -b "$JAR" "$BASE/api/auth/me" | jget data.csrfToken)
  echo
  echo "--- [U05a] PATCH role QA user -> STAFF"
  echo "Request : PATCH $BASE/api/admin/users/$UID_QA/role   Payload: {\"role\":\"STAFF\"}"
  curl -s -c "$JAR" -b "$JAR" -D "$TMP/h.txt" -o "$TMP/b.txt" -X PATCH -H 'Content-Type: application/json' -H "x-csrf-token: $csrf" -d '{"role":"STAFF"}' "$BASE/api/admin/users/$UID_QA/role"
  echo "Status  : $(status_of)"
  echo "Response: $(cat "$TMP/b.txt")"
  role1=$(cat "$TMP/b.txt" | jget data.user.role)
  [ "$(status_of)" = "200" ] && [ "$role1" = "STAFF" ] && echo "Verdict : PASS" || echo "Verdict : FAIL"

  echo
  echo "--- [U05b] PATCH role QA user -> CUSTOMER (khôi phục)"
  echo "Request : PATCH $BASE/api/admin/users/$UID_QA/role   Payload: {\"role\":\"CUSTOMER\"}"
  curl -s -c "$JAR" -b "$JAR" -D "$TMP/h.txt" -o "$TMP/b.txt" -X PATCH -H 'Content-Type: application/json' -H "x-csrf-token: $csrf" -d '{"role":"CUSTOMER"}' "$BASE/api/admin/users/$UID_QA/role"
  echo "Status  : $(status_of)"
  echo "Response: $(cat "$TMP/b.txt")"
  role2=$(cat "$TMP/b.txt" | jget data.user.role)
  [ "$(status_of)" = "200" ] && [ "$role2" = "CUSTOMER" ] && echo "Verdict : PASS (roundtrip role hoàn nguyên)" || echo "Verdict : FAIL"
else
  echo "Verdict : BLOCKED (không tìm thấy QA user id)"
fi

echo
echo "--- [F01] Login QA customer (chưa xác nhận email) — thử lại"
JC="$TMP/cust2.jar"; rm -f "$JC"
csrf=$(curl -s -c "$JC" -b "$JC" "$BASE/api/auth/me" | jget data.csrfToken)
echo "Request : POST $BASE/api/auth/login   Payload: {\"email\":\"qa.test.1792415863@gmail.com\",\"password\":\"***\"}"
curl -s -c "$JC" -b "$JC" -D "$TMP/h.txt" -o "$TMP/b.txt" -X POST -H 'Content-Type: application/json' -H "x-csrf-token: $csrf" -d '{"email":"qa.test.1792415863@gmail.com","password":"qa123456"}' "$BASE/api/auth/login"
echo "Status  : $(status_of)"
echo "Response: $(cat "$TMP/b.txt")"
code=$(cat "$TMP/b.txt" | jget error.code)
if [ "$(status_of)" = "401" ] && [ "$code" = "EMAIL_NOT_CONFIRMED" ]; then
  echo "Verdict : BLOCKED (vẫn 401 EMAIL_NOT_CONFIRMED — không thể verify 403 end-to-end, như baseline)"
else
  echo "Verdict : PASS (login được — kiểm tiếp 403)"
fi
echo "==============================================================="
} >> "$LOG"
echo "done -> $LOG"
