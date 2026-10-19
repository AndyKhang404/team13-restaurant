#!/usr/bin/env bash
# QA Backend API test runner — Team13 Restaurant
# Runs real HTTP requests with curl against the dev server and logs evidence.
# Usage: bash reports/backend-testing/run_tests.sh
set -u
BASE="${BASE:-http://localhost:3000}"
DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="$DIR/tmp"
LOG="$DIR/execution_log.txt"
RESULTS="$TMP/results.tsv"
mkdir -p "$TMP"
JAR_ANON="$TMP/anon.jar"; JAR_ADMIN="$TMP/admin.jar"; JAR_CUST="$TMP/cust.jar"
rm -f "$JAR_ANON" "$JAR_ADMIN" "$JAR_CUST" "$RESULTS"

PASS=0; FAIL=0; BLOCKED=0
TS="$(date +%s)"

echo "===============================================================" >> "$LOG"
echo "QA EXECUTION RUN — $(date '+%Y-%m-%d %H:%M:%S %z')" >> "$LOG"
echo "Base URL: $BASE" >> "$LOG"
echo "===============================================================" >> "$LOG"

# --- helpers ----------------------------------------------------------------
jget() { # extract dotted path from JSON on stdin
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let o=JSON.parse(s);for(const k of process.argv[1].split(".")){o=o?.[k]}if(o===undefined||o===null){console.log("")}else if(typeof o==="object"){console.log(JSON.stringify(o))}else{console.log(o)}}catch(e){console.log("")}})' "$1"
}

req() { # method path jar [json_data] [csrf_token] -> prints body\nstatus
  local method="$1" path="$2" jar="$3" data="${4:-}" csrf="${5:-}"
  local args=(-s -X "$method" -w '\n%{http_code}' --max-time 30)
  [ -n "$jar" ] && args+=(-b "$jar" -c "$jar")
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' --data-raw "$data")
  [ -n "$csrf" ] && args+=(-H "x-csrf-token: $csrf")
  curl "${args[@]}" "$BASE$path"
}

record() { # id name expected actual verdict
  printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" >> "$RESULTS"
  case "$5" in
    PASS) PASS=$((PASS+1));;
    FAIL) FAIL=$((FAIL+1));;
    BLOCKED) BLOCKED=$((BLOCKED+1));;
  esac
}

logcase() { # id name method path data resp
  local id="$1" name="$2" method="$3" path="$4" data="$5" resp="$6"
  local status body
  status="$(tail -n1 <<<"$resp")"
  body="$(head -n -1 <<<"$resp" | head -c 1200)"
  {
    echo ""
    echo "--- [$id] $name"
    echo "Request : $method $BASE$path"
    [ -n "$data" ] && echo "Payload : $(head -c 400 <<<"$data")"
    echo "Status  : $status"
    echo "Response: $body"
  } >> "$LOG"
  echo "$status"
}

verdict() { # id name expected_desc condition(0/1) actual_desc
  local id="$1" name="$2" exp="$3" ok="$4" act="$5"
  if [ "$ok" = "0" ]; then
    record "$id" "$name" "$exp" "$act" "PASS"
    echo "Verdict : PASS" >> "$LOG"
  else
    record "$id" "$name" "$exp" "$act" "FAIL"
    echo "Verdict : FAIL" >> "$LOG"
  fi
}

blocked() { # id name reason
  record "$1" "$2" "x" "$3" "BLOCKED"
  { echo ""; echo "--- [$1] $2"; echo "BLOCKED : $3"; } >> "$LOG"
}

get_csrf() { # jar -> prints csrf token (GET /api/auth/me also sets cookies)
  req GET /api/auth/me "$1" | head -n -1 | jget data.csrfToken
}

echo "### SECTION: PUBLIC API" >> "$LOG"

# P01
resp="$(req GET /api/ "")"
st="$(logcase P01 "GET /api/ — featured" GET /api/ "" "$resp")"
okv="$(head -n -1 <<<"$resp" | jget ok)"
[ "$st" = "200" ] && [ "$okv" = "true" ]; verdict P01 "GET /api/" "200, ok:true" $? "HTTP $st, ok=$okv"

# P02
resp="$(req GET /api/home "")"
st="$(logcase P02 "GET /api/home" GET /api/home "" "$resp")"
cnt="$(head -n -1 <<<"$resp" | jget 'data.featured.length')"
[ "$st" = "200" ] && [ -n "$cnt" ]; verdict P02 "GET /api/home" "200, featured array" $? "HTTP $st, featured.length=$cnt"

# P03 menu
resp="$(req GET /api/menu "")"
st="$(logcase P03 "GET /api/menu" GET /api/menu "" "$resp")"
cats="$(head -n -1 <<<"$resp" | jget data.categories)"
CATKEY="$(head -n -1 <<<"$resp" | jget 'data.categories.0.key')"
SLUG="$(head -n -1 <<<"$resp" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const d=o.data.dishes&&o.data.dishes[0];console.log(d?d.slug:"")})')"
[ "$st" = "200" ] && [ -n "$CATKEY" ]; verdict P03 "GET /api/menu" "200, categories present" $? "HTTP $st, first category=$CATKEY"
echo "Info    : categories=$cats" >> "$LOG"
echo "Info    : sample slug=$SLUG" >> "$LOG"

# P04 filter by valid category
resp="$(req GET "/api/menu?category=$CATKEY" "")"
st="$(logcase P04 "GET /api/menu?category=<valid>" GET "/api/menu?category=$CATKEY" "" "$resp")"
bad="$(head -n -1 <<<"$resp" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const cat=o.data.category;const bad=(o.data.dishes||[]).filter(d=>d.category!==cat).length;console.log(bad)})' 2>/dev/null)"
[ "$st" = "200" ] && [ "$bad" = "0" ]; verdict P04 "menu filter by category" "200, all dishes match category" $? "HTTP $st, mismatched=$bad"

# P05 invalid category ignored
resp="$(req GET "/api/menu?category=HACKED_XYZ" "")"
st="$(logcase P05 "GET /api/menu?category=invalid" GET "/api/menu?category=HACKED_XYZ" "" "$resp")"
catv="$(head -n -1 <<<"$resp" | jget data.category)"
[ "$st" = "200" ] && [ -z "$catv" ]; verdict P05 "menu invalid category" "200, category ignored (undefined)" $? "HTTP $st, category='$catv'"

# P06 search
resp="$(req GET "/api/menu?q=a" "")"
st="$(logcase P06 "GET /api/menu?q=a" GET "/api/menu?q=a" "" "$resp")"
flat="$(head -n -1 <<<"$resp" | jget data.flat)"
[ "$st" = "200" ] && [ "$flat" = "true" ]; verdict P06 "menu search q" "200, flat=true when q present" $? "HTTP $st, flat=$flat"

# P07 sort price-asc integrity
resp="$(req GET "/api/menu?sort=price-asc" "")"
st="$(logcase P07 "GET /api/menu?sort=price-asc" GET "/api/menu?sort=price-asc" "" "$resp")"
sorted="$(head -n -1 <<<"$resp" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const p=(o.data.dishes||[]).map(d=>Number(d.price));let ok=true;for(let i=1;i<p.length;i++)if(p[i]<p[i-1])ok=false;console.log(ok?"yes":"no")})')"
[ "$st" = "200" ] && [ "$sorted" = "yes" ]; verdict P07 "menu sort price-asc" "200, prices ascending" $? "HTTP $st, sorted=$sorted"

# P08 invalid sort falls back
resp="$(req GET "/api/menu?sort=bogus" "")"
st="$(logcase P08 "GET /api/menu?sort=bogus" GET "/api/menu?sort=bogus" "" "$resp")"
sortv="$(head -n -1 <<<"$resp" | jget data.sort)"
[ "$st" = "200" ] && [ "$sortv" = "" ]; verdict P08 "menu invalid sort" "200, sort falls back to default" $? "HTTP $st, sort='$sortv'"

# P09 dish detail valid slug
if [ -n "$SLUG" ]; then
  resp="$(req GET "/api/dishes/$SLUG" "")"
  st="$(logcase P09 "GET /api/dishes/<valid-slug>" GET "/api/dishes/$SLUG" "" "$resp")"
  dname="$(head -n -1 <<<"$resp" | jget data.dish.name)"
  [ "$st" = "200" ] && [ -n "$dname" ]; verdict P09 "public dish detail" "200, dish object" $? "HTTP $st, dish=$dname"
else
  blocked P09 "public dish detail" "Menu trống — không có slug nào để test"
fi

# P10 dish detail not found
resp="$(req GET "/api/dishes/slug-khong-ton-tai-qa-$TS" "")"
st="$(logcase P10 "GET /api/dishes/<slug-khong-ton-tai>" GET "/api/dishes/slug-khong-ton-tai-qa-$TS" "" "$resp")"
code="$(head -n -1 <<<"$resp" | jget error.code)"
[ "$st" = "404" ] && [ "$code" = "NOT_FOUND" ]; verdict P10 "dish detail 404" "404 NOT_FOUND" $? "HTTP $st, code=$code"

# P11 unknown endpoint
resp="$(req GET "/api/khong-co-endpoint-nay" "")"
st="$(logcase P11 "GET /api/<unknown>" GET "/api/khong-co-endpoint-nay" "" "$resp")"
[ "$st" = "404" ]; verdict P11 "unknown endpoint 404" "404" $? "HTTP $st"

echo "### SECTION: CORS" >> "$LOG"

# CORS01: request kèm Origin của SPA dev (Vite: http://localhost:5173)
hdrs="$(curl -s -D - -o /dev/null --max-time 30 -H 'Origin: http://localhost:5173' "$BASE/api/menu")"
{
  echo ""
  echo "--- [CORS01] GET /api/menu với Origin: http://localhost:5173"
  echo "Response headers:"
  echo "$hdrs"
} >> "$LOG"
acao="$(grep -i '^access-control-allow-origin:' <<<"$hdrs" | tr -d '\r' | awk '{print $2}')"
if [ "$acao" = "http://localhost:5173" ]; then
  verdict CORS01 "CORS header khi có Origin" "Access-Control-Allow-Origin = origin SPA, không phải * (theo đề bài)" 0 "ACAO=$acao"
else
  verdict CORS01 "CORS header khi có Origin" "Access-Control-Allow-Origin = origin SPA, không phải * (theo đề bài)" 1 "ACAO='${acao:-không có header}'"
fi

# CORS02: preflight OPTIONS
hdrs="$(curl -s -D - -o /dev/null --max-time 30 -X OPTIONS -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: PATCH' -H 'Access-Control-Request-Headers: content-type' "$BASE/api/menu")"
optst="$(head -n1 <<<"$hdrs" | awk '{print $2}')"
{
  echo ""
  echo "--- [CORS02] OPTIONS /api/menu (preflight, Request-Method: PATCH)"
  echo "Response headers:"
  echo "$hdrs"
} >> "$LOG"
acam="$(grep -i '^access-control-allow-methods:' <<<"$hdrs" | tr -d '\r')"
if { [ "$optst" = "204" ] || [ "$optst" = "200" ]; } && [ -n "$acam" ]; then
  verdict CORS02 "CORS preflight OPTIONS" "204/200 + Allow-Methods/Headers (theo đề bài)" 0 "HTTP $optst, $acam"
else
  verdict CORS02 "CORS preflight OPTIONS" "204/200 + Allow-Methods/Headers (theo đề bài)" 1 "HTTP $optst, Allow-Methods='${acam:-không có}'"
fi

echo "### SECTION: CSRF & AUTH" >> "$LOG"

# X01 login without CSRF token
resp="$(req POST /api/auth/login "$JAR_ANON" '{"email":"a@b.com","password":"x12345"}')"
st="$(logcase X01 "POST login KHÔNG có CSRF token" POST /api/auth/login '{"email":"a@b.com","password":"x12345"}' "$resp")"
code="$(head -n -1 <<<"$resp" | jget error.code)"
[ "$st" = "403" ] && [ "$code" = "CSRF_INVALID" ]; verdict X01 "mutation without CSRF" "403 CSRF_INVALID" $? "HTTP $st, code=$code"

# X02 login with wrong CSRF token
resp="$(req POST /api/auth/login "$JAR_ANON" '{"email":"a@b.com","password":"x12345"}' "sai-token-123")"
st="$(logcase X02 "POST login với CSRF token SAI" POST /api/auth/login '{"email":"a@b.com","password":"x12345"}' "$resp")"
code="$(head -n -1 <<<"$resp" | jget error.code)"
[ "$st" = "403" ] && [ "$code" = "CSRF_INVALID" ]; verdict X02 "mutation wrong CSRF" "403 CSRF_INVALID" $? "HTTP $st, code=$code"

CSRF_ANON="$(get_csrf "$JAR_ANON")"
echo "Info    : anon csrf token acquired (${#CSRF_ANON} chars)" >> "$LOG"

# A01 invalid email format
resp="$(req POST /api/auth/login "$JAR_ANON" '{"email":"khong-phai-email","password":"x12345"}' "$CSRF_ANON")"
st="$(logcase A01 "POST login email sai định dạng" POST /api/auth/login '{"email":"khong-phai-email",...}' "$resp")"
code="$(head -n -1 <<<"$resp" | jget error.code)"
[ "$st" = "422" ] && [ "$code" = "VALIDATION_ERROR" ]; verdict A01 "login invalid email" "422 VALIDATION_ERROR" $? "HTTP $st, code=$code"

# A02 missing password
resp="$(req POST /api/auth/login "$JAR_ANON" '{"email":"a@b.com"}' "$CSRF_ANON")"
st="$(logcase A02 "POST login thiếu password" POST /api/auth/login '{"email":"a@b.com"}' "$resp")"
code="$(head -n -1 <<<"$resp" | jget error.code)"
[ "$st" = "422" ] && [ "$code" = "VALIDATION_ERROR" ]; verdict A02 "login missing password" "422 VALIDATION_ERROR" $? "HTTP $st, code=$code"

# A03 wrong credentials
resp="$(req POST /api/auth/login "$JAR_ANON" '{"email":"andykhang404@gmail.com","password":"sai-mat-khau"}' "$CSRF_ANON")"
st="$(logcase A03 "POST login sai mật khẩu" POST /api/auth/login '{"email":"andykhang404@gmail.com","password":"***sai***"}' "$resp")"
code="$(head -n -1 <<<"$resp" | jget error.code)"
[ "$st" = "401" ] && [ "$code" = "INVALID_CREDENTIALS" ]; verdict A03 "login wrong password" "401 INVALID_CREDENTIALS" $? "HTTP $st, code=$code"

# A04 /me anonymous
resp="$(req GET /api/auth/me "$JAR_ANON")"
st="$(logcase A04 "GET /api/auth/me (anonymous)" GET /api/auth/me "" "$resp")"
userv="$(head -n -1 <<<"$resp" | jget data.user)"
[ "$st" = "200" ] && { [ -z "$userv" ] || [ "$userv" = "null" ]; }; verdict A04 "me anonymous" "200, user=null" $? "HTTP $st, user='$userv'"

# A05 admin login success
CSRF_ADMIN="$(get_csrf "$JAR_ADMIN")"
resp="$(req POST /api/auth/login "$JAR_ADMIN" '{"email":"andykhang404@gmail.com","password":"pass123"}' "$CSRF_ADMIN")"
st="$(logcase A05 "POST login ADMIN hợp lệ" POST /api/auth/login '{"email":"andykhang404@gmail.com","password":"***"}' "$resp")"
role="$(head -n -1 <<<"$resp" | jget data.user.role)"
ADMIN_ID="$(head -n -1 <<<"$resp" | jget data.user.id)"
[ "$st" = "200" ] && [ "$role" = "ADMIN" ]; verdict A05 "admin login" "200, role=ADMIN" $? "HTTP $st, role=$role"
echo "Info    : admin id=$ADMIN_ID" >> "$LOG"

# A06 /me authenticated
resp="$(req GET /api/auth/me "$JAR_ADMIN")"
st="$(logcase A06 "GET /api/auth/me (admin)" GET /api/auth/me "" "$resp")"
email="$(head -n -1 <<<"$resp" | jget data.user.email)"
[ "$st" = "200" ] && [ "$email" = "andykhang404@gmail.com" ]; verdict A06 "me authenticated" "200, correct email" $? "HTTP $st, email=$email"

# A07 register confirm mismatch
resp="$(req POST /api/auth/register "$JAR_ANON" '{"email":"qa.test.'"$TS"'@gmail.com","password":"qa123456","confirmPassword":"khac123"}' "$CSRF_ANON")"
st="$(logcase A07 "POST register confirmPassword không khớp" POST /api/auth/register '{...confirmPassword:"khac123"}' "$resp")"
code="$(head -n -1 <<<"$resp" | jget error.code)"
[ "$st" = "422" ] && [ "$code" = "VALIDATION_ERROR" ]; verdict A07 "register confirm mismatch" "422 VALIDATION_ERROR" $? "HTTP $st, code=$code"

# A08 register short password
resp="$(req POST /api/auth/register "$JAR_ANON" '{"email":"qa.test.'"$TS"'@gmail.com","password":"123","confirmPassword":"123"}' "$CSRF_ANON")"
st="$(logcase A08 "POST register password < 6 ký tự" POST /api/auth/register '{...password:"123"}' "$resp")"
code="$(head -n -1 <<<"$resp" | jget error.code)"
[ "$st" = "422" ] && [ "$code" = "VALIDATION_ERROR" ]; verdict A08 "register short password" "422 VALIDATION_ERROR" $? "HTTP $st, code=$code"

# A09 register valid (creates QA account in Supabase Auth + Profile)
QA_EMAIL="qa.test.$TS@gmail.com"
CSRF_CUST="$(get_csrf "$JAR_CUST")"
resp="$(req POST /api/auth/register "$JAR_CUST" '{"displayName":"QA Test User","email":"'"$QA_EMAIL"'","password":"qa123456","confirmPassword":"qa123456"}' "$CSRF_CUST")"
st="$(logcase A09 "POST register hợp lệ (QA user)" POST /api/auth/register '{"email":"'"$QA_EMAIL"'",...}' "$resp")"
QA_USER_ID="$(head -n -1 <<<"$resp" | jget data.user.id)"
if [ "$st" = "200" ]; then
  verdict A09 "register valid" "200 ok" 0 "HTTP $st, requiresEmailConfirmation=$(head -n -1 <<<"$resp" | jget data.requiresEmailConfirmation)"
else
  code="$(head -n -1 <<<"$resp" | jget error.code)"
  verdict A09 "register valid" "200 ok" 1 "HTTP $st, code=$code"
fi
echo "Info    : QA user id=$QA_USER_ID email=$QA_EMAIL" >> "$LOG"

# A10 register duplicate email
resp="$(req POST /api/auth/register "$JAR_ANON" '{"email":"'"$QA_EMAIL"'","password":"qa123456","confirmPassword":"qa123456"}' "$CSRF_ANON")"
st="$(logcase A10 "POST register email trùng" POST /api/auth/register '{"email":"'"$QA_EMAIL"'(trùng)}' "$resp")"
if [ "$st" != "200" ]; then
  verdict A10 "register duplicate email" "không cho phép (4xx)" 0 "HTTP $st"
else
  # Supabase có thể trả 200 nhưng không tạo session (chống user enumeration) — ghi nhận thực tế
  verdict A10 "register duplicate email" "không cho phép (4xx)" 1 "HTTP $st (Supabase trả 200 — có thể là hành vi chống enumeration)"
fi

echo "### SECTION: ADMIN (authenticated)" >> "$LOG"

# M01 stats anonymous
resp="$(req GET /api/admin/stats "")"
st="$(logcase M01 "GET /api/admin/stats (anonymous)" GET /api/admin/stats "" "$resp")"
code="$(head -n -1 <<<"$resp" | jget error.code)"
[ "$st" = "401" ] && [ "$code" = "UNAUTHORIZED" ]; verdict M01 "admin stats anonymous" "401 UNAUTHORIZED" $? "HTTP $st, code=$code"

# M02 stats as admin
resp="$(req GET /api/admin/stats "$JAR_ADMIN")"
st="$(logcase M02 "GET /api/admin/stats (admin)" GET /api/admin/stats "" "$resp")"
dishc="$(head -n -1 <<<"$resp" | jget data.stats.dishCount)"
[ "$st" = "200" ] && [ -n "$dishc" ]; verdict M02 "admin stats" "200, stats object" $? "HTTP $st, dishCount=$dishc"

# M03 admin root
resp="$(req GET /api/admin/ "$JAR_ADMIN")"
st="$(logcase M03 "GET /api/admin/" GET /api/admin/ "" "$resp")"
[ "$st" = "200" ]; verdict M03 "admin root" "200" $? "HTTP $st"

# F01 customer (QA user) tries admin endpoint
if [ -n "$QA_USER_ID" ]; then
  resp="$(req POST /api/auth/login "$JAR_CUST" '{"email":"'"$QA_EMAIL"'","password":"qa123456"}' "$CSRF_CUST")"
  loginst="$(tail -n1 <<<"$resp")"
  if [ "$loginst" = "200" ]; then
    resp2="$(req GET /api/admin/stats "$JAR_CUST")"
    st="$(logcase F01 "GET /api/admin/stats (customer role)" GET /api/admin/stats "" "$resp2")"
    code="$(head -n -1 <<<"$resp2" | jget error.code)"
    [ "$st" = "403" ] && [ "$code" = "FORBIDDEN" ]; verdict F01 "customer forbidden from admin" "403 FORBIDDEN" $? "HTTP $st, code=$code"
  else
    blocked F01 "customer forbidden from admin" "Không login được bằng QA user (HTTP $loginst) — có thể Supabase yêu cầu xác nhận email"
  fi
else
  blocked F01 "customer forbidden from admin" "Register QA user thất bại ở A09"
fi

echo "### SECTION: ADMIN DISHES CRUD" >> "$LOG"
CSRF_ADMIN="$(get_csrf "$JAR_ADMIN")"

# D01 dishes list anonymous
resp="$(req GET /api/admin/dishes "")"
st="$(logcase D01 "GET /api/admin/dishes (anonymous)" GET /api/admin/dishes "" "$resp")"
[ "$st" = "401" ]; verdict D01 "admin dishes anonymous" "401" $? "HTTP $st"

# D02 dishes list
resp="$(req GET "/api/admin/dishes" "$JAR_ADMIN")"
st="$(logcase D02 "GET /api/admin/dishes" GET /api/admin/dishes "" "$resp")"
total="$(head -n -1 <<<"$resp" | jget data.pagination.total)"
[ "$st" = "200" ] && [ -n "$total" ]; verdict D02 "admin dishes list" "200, pagination" $? "HTTP $st, total=$total"

# D03 search
resp="$(req GET "/api/admin/dishes?q=QA" "$JAR_ADMIN")"
st="$(logcase D03 "GET /api/admin/dishes?q=QA" GET "/api/admin/dishes?q=QA" "" "$resp")"
[ "$st" = "200" ]; verdict D03 "admin dishes search" "200" $? "HTTP $st"

# D04 deleted filter
resp="$(req GET "/api/admin/dishes?deleted=1" "$JAR_ADMIN")"
st="$(logcase D04 "GET /api/admin/dishes?deleted=1" GET "/api/admin/dishes?deleted=1" "" "$resp")"
[ "$st" = "200" ]; verdict D04 "admin dishes deleted filter" "200" $? "HTTP $st"

# get a valid ingredient id for dish ingredients
resp="$(req GET "/api/admin/dishes/form-deps" "$JAR_ADMIN")"
ING_ID="$(head -n -1 <<<"$resp" | jget 'data.ingredients.0.id')"
CHEF_ID="$(head -n -1 <<<"$resp" | jget 'data.chefs.0.id')"
echo "Info    : form-deps ingredient=$ING_ID chef=$CHEF_ID" >> "$LOG"

# D05 create dish valid
DISH_NAME="QA Test Dish $TS"
if [ -n "$ING_ID" ]; then ING_JSON=',"ingredients":[{"ingredientId":"'"$ING_ID"'","quantity":100,"unit":"g"}]'; else ING_JSON=''; fi
resp="$(req POST /api/admin/dishes "$JAR_ADMIN" '{"name":"'"$DISH_NAME"'","price":99000,"category":"'"$CATKEY"'","isAvailable":true'"$ING_JSON"'}' "$CSRF_ADMIN")"
st="$(logcase D05 "POST tạo món hợp lệ (kèm nguyên liệu)" POST /api/admin/dishes '{"name":"'"$DISH_NAME"'","price":99000,...}' "$resp")"
DISH_ID="$(head -n -1 <<<"$resp" | jget data.dish.id)"
DISH_SLUG="$(head -n -1 <<<"$resp" | jget data.dish.slug)"
[ "$st" = "201" ] && [ -n "$DISH_ID" ]; verdict D05 "create dish valid" "201, dish id" $? "HTTP $st, id=$DISH_ID slug=$DISH_SLUG"

# D06 create dish missing name
resp="$(req POST /api/admin/dishes "$JAR_ADMIN" '{"price":99000,"category":"'"$CATKEY"'"}' "$CSRF_ADMIN")"
st="$(logcase D06 "POST tạo món thiếu name" POST /api/admin/dishes '{"price":99000,...}' "$resp")"
code="$(head -n -1 <<<"$resp" | jget error.code)"
[ "$st" = "400" ] && [ "$code" = "VALIDATION_ERROR" ]; verdict D06 "create dish missing name" "400 VALIDATION_ERROR" $? "HTTP $st, code=$code"

# D07 create dish invalid category
resp="$(req POST /api/admin/dishes "$JAR_ADMIN" '{"name":"QA Bad Cat","price":1000,"category":"KHONG_TON_TAI"}' "$CSRF_ADMIN")"
st="$(logcase D07 "POST tạo món category không hợp lệ" POST /api/admin/dishes '{...category:"KHONG_TON_TAI"}' "$resp")"
[ "$st" = "400" ]; verdict D07 "create dish invalid category" "400" $? "HTTP $st"

# D08 create dish negative price
resp="$(req POST /api/admin/dishes "$JAR_ADMIN" '{"name":"QA Negative","price":-500,"category":"'"$CATKEY"'"}' "$CSRF_ADMIN")"
st="$(logcase D08 "POST tạo món giá âm" POST /api/admin/dishes '{...price:-500}' "$resp")"
[ "$st" = "400" ]; verdict D08 "create dish negative price" "400" $? "HTTP $st"

# D09 same name again -> slug auto-suffix
resp="$(req POST /api/admin/dishes "$JAR_ADMIN" '{"name":"'"$DISH_NAME"'","price":88000,"category":"'"$CATKEY"'"}' "$CSRF_ADMIN")"
st="$(logcase D09 "POST tạo món TRÙNG tên (slug tự động)" POST /api/admin/dishes '{"name":"'"$DISH_NAME"'(trùng)}' "$resp")"
DISH2_ID="$(head -n -1 <<<"$resp" | jget data.dish.id)"
DISH2_SLUG="$(head -n -1 <<<"$resp" | jget data.dish.slug)"
if [ "$st" = "201" ] && [ -n "$DISH2_SLUG" ] && [ "$DISH2_SLUG" != "$DISH_SLUG" ]; then
  verdict D09 "duplicate dish name slug" "201, slug khác biệt (auto-suffix)" 0 "HTTP $st, slug2=$DISH2_SLUG"
elif [ "$st" = "409" ]; then
  verdict D09 "duplicate dish name slug" "201, slug khác biệt (auto-suffix)" 0 "HTTP 409 CONFLICT (server từ chối trùng)"
else
  verdict D09 "duplicate dish name slug" "201, slug khác biệt (auto-suffix)" 1 "HTTP $st, slug2=$DISH2_SLUG"
fi

# D10 get dish by id
if [ -n "$DISH_ID" ]; then
  resp="$(req GET "/api/admin/dishes/$DISH_ID" "$JAR_ADMIN")"
  st="$(logcase D10 "GET /api/admin/dishes/<id>" GET "/api/admin/dishes/$DISH_ID" "" "$resp")"
  ding="$(head -n -1 <<<"$resp" | jget 'data.dishIngredients.0.ingredientId')"
  [ "$st" = "200" ]; verdict D10 "get dish by id" "200, kèm dishIngredients" $? "HTTP $st, firstIngredient=$ding"
else
  blocked D10 "get dish by id" "D05 không tạo được dish"
fi

# D11 invalid uuid
resp="$(req GET "/api/admin/dishes/khong-phai-uuid" "$JAR_ADMIN")"
st="$(logcase D11 "GET /api/admin/dishes/<id-không-phải-uuid>" GET "/api/admin/dishes/khong-phai-uuid" "" "$resp")"
[ "$st" = "404" ]; verdict D11 "dish invalid uuid" "404 (không crash 500)" $? "HTTP $st"

# D12 random uuid not found
RAND_UUID="00000000-0000-4000-8000-$(printf '%012d' $((TS % 1000000000000)))"
resp="$(req GET "/api/admin/dishes/$RAND_UUID" "$JAR_ADMIN")"
st="$(logcase D12 "GET /api/admin/dishes/<uuid-không-tồn-tại>" GET "/api/admin/dishes/$RAND_UUID" "" "$resp")"
[ "$st" = "404" ]; verdict D12 "dish uuid not found" "404" $? "HTTP $st"

# D13 update dish
if [ -n "$DISH_ID" ]; then
  resp="$(req PATCH "/api/admin/dishes/$DISH_ID" "$JAR_ADMIN" '{"name":"'"$DISH_NAME"' Updated","price":123000,"category":"'"$CATKEY"'","isAvailable":true,"isFeatured":true}' "$CSRF_ADMIN")"
  st="$(logcase D13 "PATCH cập nhật món" PATCH "/api/admin/dishes/$DISH_ID" '{"name":"...Updated","price":123000}' "$resp")"
  newprice="$(head -n -1 <<<"$resp" | jget data.dish.price)"
  [ "$st" = "200" ] && { [ "$newprice" = "123000" ] || [ "$newprice" = "123000.0" ]; }; verdict D13 "update dish" "200, price=123000" $? "HTTP $st, price=$newprice"
else
  blocked D13 "update dish" "D05 không tạo được dish"
fi

# D14 update dish invalid data
if [ -n "$DISH_ID" ]; then
  resp="$(req PATCH "/api/admin/dishes/$DISH_ID" "$JAR_ADMIN" '{"name":"","price":"abc","category":"'"$CATKEY"'"}' "$CSRF_ADMIN")"
  st="$(logcase D14 "PATCH món dữ liệu không hợp lệ" PATCH "/api/admin/dishes/$DISH_ID" '{"name":"","price":"abc"}' "$resp")"
  [ "$st" = "400" ]; verdict D14 "update dish invalid" "400 VALIDATION_ERROR" $? "HTTP $st"
else
  blocked D14 "update dish invalid" "D05 không tạo được dish"
fi

# D15 soft delete + verify hidden from public
if [ -n "$DISH2_ID" ]; then
  resp="$(req DELETE "/api/admin/dishes/$DISH2_ID" "$JAR_ADMIN" "" "$CSRF_ADMIN")"
  st="$(logcase D15 "DELETE món (soft delete)" DELETE "/api/admin/dishes/$DISH2_ID" "" "$resp")"
  pub="$(req GET "/api/dishes/$DISH2_SLUG" "")"
  pubst="$(tail -n1 <<<"$pub")"
  [ "$st" = "200" ] && [ "$pubst" = "404" ]; verdict D15 "soft delete hides from public" "200 + public 404" $? "delete HTTP $st, public HTTP $pubst"
else
  blocked D15 "soft delete" "D09 không tạo được dish thứ 2"
fi

# D16 restore
if [ -n "$DISH2_ID" ]; then
  resp="$(req POST "/api/admin/dishes/$DISH2_ID/restore" "$JAR_ADMIN" "" "$CSRF_ADMIN")"
  st="$(logcase D16 "POST khôi phục món" POST "/api/admin/dishes/$DISH2_ID/restore" "" "$resp")"
  pub="$(req GET "/api/dishes/$DISH2_SLUG" "")"
  pubst="$(tail -n1 <<<"$pub")"
  [ "$st" = "200" ] && [ "$pubst" = "200" ]; verdict D16 "restore dish" "200 + public 200" $? "restore HTTP $st, public HTTP $pubst"
else
  blocked D16 "restore dish" "D09 không tạo được dish thứ 2"
fi

# D17 delete nonexistent
resp="$(req DELETE "/api/admin/dishes/$RAND_UUID" "$JAR_ADMIN" "" "$CSRF_ADMIN")"
st="$(logcase D17 "DELETE món không tồn tại" DELETE "/api/admin/dishes/$RAND_UUID" "" "$resp")"
[ "$st" = "404" ]; verdict D17 "delete dish not found" "404" $? "HTTP $st"

echo "### SECTION: ADMIN INGREDIENTS CRUD" >> "$LOG"
ING_NAME="QA Test Ingredient $TS"

# I01 list
resp="$(req GET "/api/admin/ingredients" "$JAR_ADMIN")"
st="$(logcase I01 "GET /api/admin/ingredients" GET /api/admin/ingredients "" "$resp")"
[ "$st" = "200" ]; verdict I01 "ingredients list" "200" $? "HTTP $st"

# I02 create valid
resp="$(req POST /api/admin/ingredients "$JAR_ADMIN" '{"name":"'"$ING_NAME"'","unit":"g","stockQuantity":500,"pricePerUnit":1500,"isAvailable":true}' "$CSRF_ADMIN")"
st="$(logcase I02 "POST tạo nguyên liệu hợp lệ" POST /api/admin/ingredients '{"name":"'"$ING_NAME"'",...}' "$resp")"
NEW_ING_ID="$(head -n -1 <<<"$resp" | jget data.ingredient.id)"
[ "$st" = "201" ] && [ -n "$NEW_ING_ID" ]; verdict I02 "create ingredient valid" "201" $? "HTTP $st, id=$NEW_ING_ID"

# I03 duplicate name
resp="$(req POST /api/admin/ingredients "$JAR_ADMIN" '{"name":"'"$ING_NAME"'","unit":"g"}' "$CSRF_ADMIN")"
st="$(logcase I03 "POST tạo nguyên liệu TRÙNG tên" POST /api/admin/ingredients '{"name":"'"$ING_NAME"'(trùng)}' "$resp")"
code="$(head -n -1 <<<"$resp" | jget error.code)"
[ "$st" = "409" ] && [ "$code" = "CONFLICT" ]; verdict I03 "create ingredient duplicate" "409 CONFLICT" $? "HTTP $st, code=$code"

# I04 missing name
resp="$(req POST /api/admin/ingredients "$JAR_ADMIN" '{"unit":"g"}' "$CSRF_ADMIN")"
st="$(logcase I04 "POST nguyên liệu thiếu name" POST /api/admin/ingredients '{"unit":"g"}' "$resp")"
[ "$st" = "400" ]; verdict I04 "create ingredient missing name" "400" $? "HTTP $st"

# I05 negative stock
resp="$(req POST /api/admin/ingredients "$JAR_ADMIN" '{"name":"QA Neg Stock","stockQuantity":-10}' "$CSRF_ADMIN")"
st="$(logcase I05 "POST nguyên liệu tồn kho âm" POST /api/admin/ingredients '{...stockQuantity:-10}' "$resp")"
[ "$st" = "400" ]; verdict I05 "create ingredient negative stock" "400" $? "HTTP $st"

# I06 get by id
if [ -n "$NEW_ING_ID" ]; then
  resp="$(req GET "/api/admin/ingredients/$NEW_ING_ID" "$JAR_ADMIN")"
  st="$(logcase I06 "GET /api/admin/ingredients/<id>" GET "/api/admin/ingredients/$NEW_ING_ID" "" "$resp")"
  [ "$st" = "200" ]; verdict I06 "get ingredient by id" "200" $? "HTTP $st"
else
  blocked I06 "get ingredient by id" "I02 không tạo được ingredient"
fi

# I07 update
if [ -n "$NEW_ING_ID" ]; then
  resp="$(req PATCH "/api/admin/ingredients/$NEW_ING_ID" "$JAR_ADMIN" '{"name":"'"$ING_NAME"' Updated","unit":"kg","stockQuantity":250,"pricePerUnit":2000,"isAvailable":true}' "$CSRF_ADMIN")"
  st="$(logcase I07 "PATCH cập nhật nguyên liệu" PATCH "/api/admin/ingredients/$NEW_ING_ID" '{"name":"...Updated","unit":"kg"}' "$resp")"
  unit="$(head -n -1 <<<"$resp" | jget data.ingredient.unit)"
  [ "$st" = "200" ] && [ "$unit" = "kg" ]; verdict I07 "update ingredient" "200, unit=kg" $? "HTTP $st, unit=$unit"
else
  blocked I07 "update ingredient" "I02 không tạo được ingredient"
fi

# I08 delete + show in deleted list
if [ -n "$NEW_ING_ID" ]; then
  resp="$(req DELETE "/api/admin/ingredients/$NEW_ING_ID" "$JAR_ADMIN" "" "$CSRF_ADMIN")"
  st="$(logcase I08 "DELETE nguyên liệu (soft)" DELETE "/api/admin/ingredients/$NEW_ING_ID" "" "$resp")"
  del="$(req GET "/api/admin/ingredients?deleted=1&q=QA" "$JAR_ADMIN")"
  found="$(head -n -1 <<<"$del" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log((o.data.ingredients||[]).some(i=>i.id===process.argv[1])?"yes":"no")})' "$NEW_ING_ID")"
  [ "$st" = "200" ] && [ "$found" = "yes" ]; verdict I08 "soft delete ingredient" "200 + xuất hiện ở deleted=1" $? "HTTP $st, inDeletedList=$found"
else
  blocked I08 "soft delete ingredient" "I02 không tạo được ingredient"
fi

# I09 restore
if [ -n "$NEW_ING_ID" ]; then
  resp="$(req POST "/api/admin/ingredients/$NEW_ING_ID/restore" "$JAR_ADMIN" "" "$CSRF_ADMIN")"
  st="$(logcase I09 "POST khôi phục nguyên liệu" POST "/api/admin/ingredients/$NEW_ING_ID/restore" "" "$resp")"
  [ "$st" = "200" ]; verdict I09 "restore ingredient" "200" $? "HTTP $st"
else
  blocked I09 "restore ingredient" "I02 không tạo được ingredient"
fi

echo "### SECTION: ADMIN CHEFS CRUD" >> "$LOG"
CHEF_NAME="QA Test Chef $TS"

# C01 list
resp="$(req GET "/api/admin/chefs" "$JAR_ADMIN")"
st="$(logcase C01 "GET /api/admin/chefs" GET /api/admin/chefs "" "$resp")"
[ "$st" = "200" ]; verdict C01 "chefs list" "200" $? "HTTP $st"

# C02 create valid
resp="$(req POST /api/admin/chefs "$JAR_ADMIN" '{"name":"'"$CHEF_NAME"'","specialty":"QA Specialty","bio":"Chef phục vụ kiểm thử","experienceYears":5,"phone":"0901234567","isActive":true}' "$CSRF_ADMIN")"
st="$(logcase C02 "POST tạo đầu bếp hợp lệ" POST /api/admin/chefs '{"name":"'"$CHEF_NAME"'",...}' "$resp")"
NEW_CHEF_ID="$(head -n -1 <<<"$resp" | jget data.chef.id)"
[ "$st" = "201" ] && [ -n "$NEW_CHEF_ID" ]; verdict C02 "create chef valid" "201" $? "HTTP $st, id=$NEW_CHEF_ID"

# C03 invalid phone
resp="$(req POST /api/admin/chefs "$JAR_ADMIN" '{"name":"QA Bad Phone","phone":"abc-xyz"}' "$CSRF_ADMIN")"
st="$(logcase C03 "POST đầu bếp SĐT không hợp lệ" POST /api/admin/chefs '{...phone:"abc-xyz"}' "$resp")"
[ "$st" = "400" ]; verdict C03 "create chef invalid phone" "400" $? "HTTP $st"

# C04 missing name
resp="$(req POST /api/admin/chefs "$JAR_ADMIN" '{"specialty":"X"}' "$CSRF_ADMIN")"
st="$(logcase C04 "POST đầu bếp thiếu name" POST /api/admin/chefs '{"specialty":"X"}' "$resp")"
[ "$st" = "400" ]; verdict C04 "create chef missing name" "400" $? "HTTP $st"

# C05 experienceYears over max
resp="$(req POST /api/admin/chefs "$JAR_ADMIN" '{"name":"QA Over Exp","experienceYears":200}' "$CSRF_ADMIN")"
st="$(logcase C05 "POST đầu bếp experienceYears=200" POST /api/admin/chefs '{...experienceYears:200}' "$resp")"
[ "$st" = "400" ]; verdict C05 "create chef exp>100" "400" $? "HTTP $st"

# C06 get by id
if [ -n "$NEW_CHEF_ID" ]; then
  resp="$(req GET "/api/admin/chefs/$NEW_CHEF_ID" "$JAR_ADMIN")"
  st="$(logcase C06 "GET /api/admin/chefs/<id>" GET "/api/admin/chefs/$NEW_CHEF_ID" "" "$resp")"
  [ "$st" = "200" ]; verdict C06 "get chef by id" "200" $? "HTTP $st"
else
  blocked C06 "get chef by id" "C02 không tạo được chef"
fi

# C07 update
if [ -n "$NEW_CHEF_ID" ]; then
  resp="$(req PATCH "/api/admin/chefs/$NEW_CHEF_ID" "$JAR_ADMIN" '{"name":"'"$CHEF_NAME"' Updated","experienceYears":7,"isActive":true}' "$CSRF_ADMIN")"
  st="$(logcase C07 "PATCH cập nhật đầu bếp" PATCH "/api/admin/chefs/$NEW_CHEF_ID" '{"name":"...Updated","experienceYears":7}' "$resp")"
  exp="$(head -n -1 <<<"$resp" | jget data.chef.experienceYears)"
  [ "$st" = "200" ] && [ "$exp" = "7" ]; verdict C07 "update chef" "200, experienceYears=7" $? "HTTP $st, exp=$exp"
else
  blocked C07 "update chef" "C02 không tạo được chef"
fi

# C08 delete
if [ -n "$NEW_CHEF_ID" ]; then
  resp="$(req DELETE "/api/admin/chefs/$NEW_CHEF_ID" "$JAR_ADMIN" "" "$CSRF_ADMIN")"
  st="$(logcase C08 "DELETE đầu bếp (soft)" DELETE "/api/admin/chefs/$NEW_CHEF_ID" "" "$resp")"
  [ "$st" = "200" ]; verdict C08 "soft delete chef" "200" $? "HTTP $st"
else
  blocked C08 "soft delete chef" "C02 không tạo được chef"
fi

# C09 restore
if [ -n "$NEW_CHEF_ID" ]; then
  resp="$(req POST "/api/admin/chefs/$NEW_CHEF_ID/restore" "$JAR_ADMIN" "" "$CSRF_ADMIN")"
  st="$(logcase C09 "POST khôi phục đầu bếp" POST "/api/admin/chefs/$NEW_CHEF_ID/restore" "" "$resp")"
  [ "$st" = "200" ]; verdict C09 "restore chef" "200" $? "HTTP $st"
else
  blocked C09 "restore chef" "C02 không tạo được chef"
fi

echo "### SECTION: ADMIN USERS" >> "$LOG"

# U01 users list
resp="$(req GET "/api/admin/users" "$JAR_ADMIN")"
st="$(logcase U01 "GET /api/admin/users" GET /api/admin/users "" "$resp")"
[ "$st" = "200" ]; verdict U01 "users list" "200" $? "HTTP $st"

# U02 invalid role value
TARGET="${QA_USER_ID:-$RAND_UUID}"
resp="$(req PATCH "/api/admin/users/$TARGET/role" "$JAR_ADMIN" '{"role":"SUPERADMIN"}' "$CSRF_ADMIN")"
st="$(logcase U02 "PATCH role giá trị không hợp lệ" PATCH "/api/admin/users/$TARGET/role" '{"role":"SUPERADMIN"}' "$resp")"
[ "$st" = "400" ]; verdict U02 "update role invalid value" "400" $? "HTTP $st"

# U03 nonexistent user
resp="$(req PATCH "/api/admin/users/$RAND_UUID/role" "$JAR_ADMIN" '{"role":"CUSTOMER"}' "$CSRF_ADMIN")"
st="$(logcase U03 "PATCH role user không tồn tại" PATCH "/api/admin/users/$RAND_UUID/role" '{"role":"CUSTOMER"}' "$resp")"
[ "$st" = "404" ]; verdict U03 "update role user not found" "404" $? "HTTP $st"

# U04 self role change
if [ -n "$ADMIN_ID" ]; then
  resp="$(req PATCH "/api/admin/users/$ADMIN_ID/role" "$JAR_ADMIN" '{"role":"STAFF"}' "$CSRF_ADMIN")"
  st="$(logcase U04 "PATCH đổi role CHÍNH MÌNH" PATCH "/api/admin/users/$ADMIN_ID/role" '{"role":"STAFF"}' "$resp")"
  code="$(head -n -1 <<<"$resp" | jget error.code)"
  [ "$st" = "400" ] && [ "$code" = "SELF_ROLE_CHANGE" ]; verdict U04 "self role change blocked" "400 SELF_ROLE_CHANGE" $? "HTTP $st, code=$code"
else
  blocked U04 "self role change" "Không lấy được admin id ở A05"
fi

# U05 change QA user role CUSTOMER->STAFF->CUSTOMER
if [ -n "$QA_USER_ID" ]; then
  resp="$(req PATCH "/api/admin/users/$QA_USER_ID/role" "$JAR_ADMIN" '{"role":"STAFF"}' "$CSRF_ADMIN")"
  st="$(logcase U05a "PATCH role QA user -> STAFF" PATCH "/api/admin/users/$QA_USER_ID/role" '{"role":"STAFF"}' "$resp")"
  r1="$(head -n -1 <<<"$resp" | jget data.user.role)"
  resp2="$(req PATCH "/api/admin/users/$QA_USER_ID/role" "$JAR_ADMIN" '{"role":"CUSTOMER"}' "$CSRF_ADMIN")"
  st2="$(logcase U05b "PATCH role QA user -> CUSTOMER (khôi phục)" PATCH "/api/admin/users/$QA_USER_ID/role" '{"role":"CUSTOMER"}' "$resp2")"
  r2="$(head -n -1 <<<"$resp2" | jget data.user.role)"
  [ "$st" = "200" ] && [ "$r1" = "STAFF" ] && [ "$st2" = "200" ] && [ "$r2" = "CUSTOMER" ]
  verdict U05 "update user role roundtrip" "200, STAFF rồi về CUSTOMER" $? "role1=$r1 role2=$r2"
else
  blocked U05 "update user role roundtrip" "Không có QA user id (A09 thất bại)"
fi

# U06 search users
resp="$(req GET "/api/admin/users?q=qa.test" "$JAR_ADMIN")"
st="$(logcase U06 "GET /api/admin/users?q=qa.test" GET "/api/admin/users?q=qa.test" "" "$resp")"
[ "$st" = "200" ]; verdict U06 "users search" "200" $? "HTTP $st"

echo "### SECTION: LOGOUT & SESSION" >> "$LOG"

# L01 logout
resp="$(req POST /api/auth/logout "$JAR_ADMIN" '' "$CSRF_ADMIN")"
st="$(logcase L01 "POST /api/auth/logout" POST /api/auth/logout "" "$resp")"
[ "$st" = "200" ]; verdict L01 "logout" "200" $? "HTTP $st"

# L02 after logout, admin endpoint must be 401 (session revoked)
resp="$(req GET /api/admin/stats "$JAR_ADMIN")"
st="$(logcase L02 "GET /api/admin/stats sau logout" GET /api/admin/stats "" "$resp")"
[ "$st" = "401" ]; verdict L02 "session revoked after logout" "401" $? "HTTP $st"

echo "### SECTION: CLEANUP (soft-delete QA data)" >> "$LOG"

# re-login admin for cleanup (session đã bị revoke ở L01)
CSRF_ADMIN="$(get_csrf "$JAR_ADMIN")"
resp="$(req POST /api/auth/login "$JAR_ADMIN" '{"email":"andykhang404@gmail.com","password":"pass123"}' "$CSRF_ADMIN")"
st="$(tail -n1 <<<"$resp")"
echo "Info    : re-login admin for cleanup HTTP $st" >> "$LOG"
CSRF_ADMIN="$(get_csrf "$JAR_ADMIN")"

for id in "$DISH_ID" "$DISH2_ID"; do
  [ -n "$id" ] && { r="$(req DELETE "/api/admin/dishes/$id" "$JAR_ADMIN" "" "$CSRF_ADMIN")"; echo "Cleanup : DELETE dish $id -> HTTP $(tail -n1 <<<"$r")" >> "$LOG"; }
done
[ -n "${NEW_ING_ID:-}" ] && { r="$(req DELETE "/api/admin/ingredients/$NEW_ING_ID" "$JAR_ADMIN" "" "$CSRF_ADMIN")"; echo "Cleanup : DELETE ingredient $NEW_ING_ID -> HTTP $(tail -n1 <<<"$r")" >> "$LOG"; }
[ -n "${NEW_CHEF_ID:-}" ] && { r="$(req DELETE "/api/admin/chefs/$NEW_CHEF_ID" "$JAR_ADMIN" "" "$CSRF_ADMIN")"; echo "Cleanup : DELETE chef $NEW_CHEF_ID -> HTTP $(tail -n1 <<<"$r")" >> "$LOG"; }
echo "Note    : QA records chỉ bị soft-delete (API không có hard delete). QA Supabase auth user ($QA_EMAIL) vẫn tồn tại — cần xóa tay trên Supabase Dashboard nếu muốn." >> "$LOG"

echo "### SECTION: RATE LIMIT (chạy cuối — làm nghẽn quota login)" >> "$LOG"

# R01 burst login to trigger 429 (max 20/min/IP/path)
RL_RESULTS=""
for i in $(seq 1 25); do
  csrf="$(get_csrf "$JAR_ANON")"
  r="$(req POST /api/auth/login "$JAR_ANON" '{"email":"rl@example.com","password":"x12345"}' "$csrf")"
  RL_RESULTS="$RL_RESULTS $(tail -n1 <<<"$r")"
done
echo "--- [R01] Rate limit: 25 request liên tiếp POST /api/auth/login" >> "$LOG"
echo "Statuses: $RL_RESULTS" >> "$LOG"
if grep -q 429 <<<"$RL_RESULTS"; then
  record R01 "rate limit login (429 after burst)" "có 429 RATE_LIMITED" "statuses:$RL_RESULTS" PASS
  echo "Verdict : PASS" >> "$LOG"
else
  record R01 "rate limit login (429 after burst)" "có 429 RATE_LIMITED" "statuses:$RL_RESULTS" FAIL
  echo "Verdict : FAIL (không thấy 429)" >> "$LOG"
fi

echo "" >> "$LOG"
echo "SUMMARY : PASS=$PASS FAIL=$FAIL BLOCKED=$BLOCKED TOTAL=$((PASS+FAIL+BLOCKED))" >> "$LOG"
echo "===============================================================" >> "$LOG"

echo ""
echo "================ TEST SUMMARY ================"
column -t -s$'\t' "$RESULTS" 2>/dev/null || cat "$RESULTS"
echo "----------------------------------------------"
echo "PASS=$PASS FAIL=$FAIL BLOCKED=$BLOCKED TOTAL=$((PASS+FAIL+BLOCKED))"
echo "Log: $LOG"
