#!/usr/bin/env bash
#
# SVV Balaji - Phase 0 + 1 + 2 smoke test
#
# Walks the full farm-to-warehouse flow end to end against a running API:
#   login -> branch -> agri-expert user -> farmer registration -> approval
#   -> farmerCode -> agreement -> seed distribution -> training -> field visit
#   -> QR/barcode -> warehouse -> procurement plan -> harvest inspection
#   -> collection + batch generation -> inventory ledger -> batch trace
#
# Usage:
#   chmod +x smoke-test.sh
#   ./smoke-test.sh
#
# Prerequisites:
#   - API running (npm run start:dev)
#   - DB migrated (npx prisma migrate dev) and seeded (npm run prisma:seed)
#   - python3 (ships with macOS) for JSON parsing

set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000/api/v1}"
ADMIN_EMAIL="${SEED_SUPER_ADMIN_EMAIL:-admin@svvbalaji.com}"
ADMIN_PASSWORD="${SEED_SUPER_ADMIN_PASSWORD:-ChangeMe@123}"

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; BLUE=$'\033[0;34m'; RESET=$'\033[0m'

PASS=0
FAIL=0

pass() { echo "${GREEN}  PASS${RESET} $1"; PASS=$((PASS+1)); }
fail() { echo "${RED}  FAIL${RESET} $1"; FAIL=$((FAIL+1)); }
step() { echo ""; echo "${BLUE}==> $1${RESET}"; }
info() { echo "${YELLOW}       $1${RESET}"; }

# Extract a top-level field from a JSON string: echo "$json" | json_field id
json_field() {
  python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    v = d.get('$1', '')
    print('' if v is None else v)
except Exception:
    print('')
"
}

# api_call METHOD PATH [TOKEN] [JSON_BODY]
# Sets globals: RESP_BODY, RESP_CODE
api_call() {
  local method="$1" path="$2" token="${3:-}" body="${4:-}"
  local raw

  local args=(-s -w $'\n%{http_code}' -X "$method" "$BASE_URL$path" -H "Content-Type: application/json")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-d "$body")

  raw=$(curl "${args[@]}")
  RESP_CODE=$(printf '%s' "$raw" | tail -n1)
  RESP_BODY=$(printf '%s' "$raw" | sed '$d')
}

TODAY=$(date +%Y-%m-%d)
YEAR=$(date +%Y)
STAMP=$(date +%s)

echo "${BLUE}SVV Balaji - Phase 0 + 1 + 2 smoke test${RESET}"
echo "Target: $BASE_URL"

# ---------------------------------------------------------------------------
step "0. API reachable?"
# ---------------------------------------------------------------------------
# /branches requires auth, so a 401 here still proves the server is up and routing.
PING_CODE=$(curl -s -o /dev/null -m 5 -w "%{http_code}" "$BASE_URL/branches" 2>/dev/null)
CURL_EXIT=$?
if [ "$CURL_EXIT" -ne 0 ] || [ -z "$PING_CODE" ] || [ "$PING_CODE" = "000" ]; then
  fail "Cannot reach $BASE_URL - is the server running? (npm run start:dev)"
  echo ""
  echo "${RED}Aborting - nothing else can run without the API.${RESET}"
  exit 1
else
  pass "API is responding (HTTP $PING_CODE from /branches)"
fi

# ---------------------------------------------------------------------------
step "1. Auth - login as seeded Super Admin (Phase 0)"
# ---------------------------------------------------------------------------
api_call POST /auth/login "" "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"
ADMIN_TOKEN=$(printf '%s' "$RESP_BODY" | json_field accessToken)

if [ "$RESP_CODE" = "201" ] || [ "$RESP_CODE" = "200" ]; then
  if [ -n "$ADMIN_TOKEN" ]; then
    pass "Logged in, got access token"
  else
    fail "Login returned $RESP_CODE but no accessToken in response"
    info "$RESP_BODY"
    exit 1
  fi
else
  fail "Login failed (HTTP $RESP_CODE)"
  info "$RESP_BODY"
  info "Did you run 'npm run prisma:seed'? Expected user: $ADMIN_EMAIL"
  exit 1
fi

# Reject bad credentials
api_call POST /auth/login "" "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"definitely-wrong\"}"
[ "$RESP_CODE" = "401" ] && pass "Bad password correctly rejected (401)" \
                         || fail "Bad password should return 401, got $RESP_CODE"

# ---------------------------------------------------------------------------
step "2. Branches - create + list (Phase 0)"
# ---------------------------------------------------------------------------
api_call POST /branches "$ADMIN_TOKEN" \
  "{\"name\":\"Smoke Test Branch $STAMP\",\"location\":\"Test District\",\"address\":\"123 Test Road\"}"
BRANCH_ID=$(printf '%s' "$RESP_BODY" | json_field id)

if [ -n "$BRANCH_ID" ]; then
  pass "Branch created (id: ${BRANCH_ID:0:8}...)"
else
  fail "Branch creation failed (HTTP $RESP_CODE)"
  info "$RESP_BODY"
  exit 1
fi

api_call GET /branches "$ADMIN_TOKEN"
[ "$RESP_CODE" = "200" ] && pass "Branch list returns 200" \
                         || fail "Branch list failed (HTTP $RESP_CODE)"

# Unauthenticated request must be rejected
api_call GET /branches "" ""
[ "$RESP_CODE" = "401" ] && pass "Unauthenticated request correctly rejected (401)" \
                         || fail "Unauthenticated request should return 401, got $RESP_CODE"

# ---------------------------------------------------------------------------
step "3. Users - create an Agriculture Expert (Phase 0 RBAC)"
# ---------------------------------------------------------------------------
EXPERT_EMAIL="expert.$STAMP@svvbalaji.com"
EXPERT_PASSWORD="Expert@123"

api_call POST /users "$ADMIN_TOKEN" \
  "{\"email\":\"$EXPERT_EMAIL\",\"password\":\"$EXPERT_PASSWORD\",\"fullName\":\"Test Agri Expert\",\"role\":\"AGRICULTURE_EXPERT\",\"branchId\":\"$BRANCH_ID\"}"
EXPERT_ID=$(printf '%s' "$RESP_BODY" | json_field id)

if [ -n "$EXPERT_ID" ]; then
  pass "Agriculture Expert user created"
else
  fail "User creation failed (HTTP $RESP_CODE)"
  info "$RESP_BODY"
  exit 1
fi

# Password must never come back in the response
if printf '%s' "$RESP_BODY" | grep -q "passwordHash"; then
  fail "SECURITY: passwordHash leaked in user response"
else
  pass "passwordHash correctly stripped from response"
fi

api_call POST /auth/login "" "{\"email\":\"$EXPERT_EMAIL\",\"password\":\"$EXPERT_PASSWORD\"}"
EXPERT_TOKEN=$(printf '%s' "$RESP_BODY" | json_field accessToken)
[ -n "$EXPERT_TOKEN" ] && pass "Agriculture Expert can log in" \
                       || fail "Agriculture Expert login failed (HTTP $RESP_CODE)"

# ---------------------------------------------------------------------------
step "4. Farmers - registration (Phase 1, FRD 7.1)"
# ---------------------------------------------------------------------------
api_call POST /farmers "$ADMIN_TOKEN" \
  "{\"fullName\":\"Ramesh Kumar\",\"mobile\":\"9876543210\",\"village\":\"Testpur\",\"district\":\"Test District\",\"state\":\"Maharashtra\",\"farmSizeAcres\":5.5,\"cropDetails\":\"Wheat\",\"branchId\":\"$BRANCH_ID\"}"
FARMER_ID=$(printf '%s' "$RESP_BODY" | json_field id)
FARMER_STATUS=$(printf '%s' "$RESP_BODY" | json_field status)
FARMER_CODE_AT_CREATE=$(printf '%s' "$RESP_BODY" | json_field farmerCode)

if [ -n "$FARMER_ID" ]; then
  pass "Farmer registered (id: ${FARMER_ID:0:8}...)"
else
  fail "Farmer registration failed (HTTP $RESP_CODE)"
  info "$RESP_BODY"
  exit 1
fi

[ "$FARMER_STATUS" = "PENDING_VERIFICATION" ] \
  && pass "New farmer defaults to PENDING_VERIFICATION" \
  || fail "Expected status PENDING_VERIFICATION, got '$FARMER_STATUS'"

# Per FRD 8.1 the traceability code is issued on approval, NOT at registration
[ -z "$FARMER_CODE_AT_CREATE" ] \
  && pass "No farmerCode yet at registration (correct per FRD 8.1)" \
  || fail "farmerCode should be empty before approval, got '$FARMER_CODE_AT_CREATE'"

# Search filters (FRD 7.4)
api_call GET "/farmers?village=Testpur&status=PENDING_VERIFICATION" "$ADMIN_TOKEN"
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q "Ramesh Kumar"; then
  pass "Farmer search by village + status works"
else
  fail "Farmer search failed (HTTP $RESP_CODE)"
fi

# ---------------------------------------------------------------------------
step "5. RBAC - Agriculture Expert must NOT be able to approve farmers (FRD 5.1)"
# ---------------------------------------------------------------------------
api_call PATCH "/farmers/$FARMER_ID/verify" "$EXPERT_TOKEN" \
  "{\"action\":\"APPROVED\",\"remarks\":\"should be blocked\"}"
[ "$RESP_CODE" = "403" ] \
  && pass "Agriculture Expert blocked from farmer approval (403)" \
  || fail "Expected 403 for non-Super-Admin approval, got $RESP_CODE"

# ---------------------------------------------------------------------------
step "6. Farmers - approval + farmerCode generation (Phase 1, FRD 7.2 / 8.1)"
# ---------------------------------------------------------------------------
api_call PATCH "/farmers/$FARMER_ID/verify" "$ADMIN_TOKEN" \
  "{\"action\":\"APPROVED\",\"remarks\":\"Documents verified\"}"
FARMER_CODE=$(printf '%s' "$RESP_BODY" | json_field farmerCode)
NEW_STATUS=$(printf '%s' "$RESP_BODY" | json_field status)

[ "$NEW_STATUS" = "ACTIVE" ] \
  && pass "Farmer status flipped to ACTIVE on approval" \
  || fail "Expected status ACTIVE after approval, got '$NEW_STATUS'"

if printf '%s' "$FARMER_CODE" | grep -qE "^SVV-$YEAR-[0-9]{6}$"; then
  pass "farmerCode generated in correct format: $FARMER_CODE"
else
  fail "farmerCode malformed - expected SVV-$YEAR-NNNNNN, got '$FARMER_CODE'"
fi

# Second farmer should get the NEXT sequential code, not a duplicate
api_call POST /farmers "$ADMIN_TOKEN" \
  "{\"fullName\":\"Sunita Devi\",\"mobile\":\"9876500000\",\"village\":\"Testpur\",\"district\":\"Test District\",\"state\":\"Maharashtra\",\"branchId\":\"$BRANCH_ID\"}"
FARMER2_ID=$(printf '%s' "$RESP_BODY" | json_field id)

api_call PATCH "/farmers/$FARMER2_ID/verify" "$ADMIN_TOKEN" "{\"action\":\"APPROVED\"}"
FARMER2_CODE=$(printf '%s' "$RESP_BODY" | json_field farmerCode)

if [ -n "$FARMER2_CODE" ] && [ "$FARMER2_CODE" != "$FARMER_CODE" ]; then
  pass "Second farmer got a distinct code: $FARMER2_CODE (no collision)"
else
  fail "Code collision or missing - farmer1=$FARMER_CODE farmer2=$FARMER2_CODE"
fi

# Re-approving must not mint a second code for the same farmer
api_call PATCH "/farmers/$FARMER_ID/verify" "$ADMIN_TOKEN" "{\"action\":\"APPROVED\",\"remarks\":\"re-approval\"}"
RECHECK_CODE=$(printf '%s' "$RESP_BODY" | json_field farmerCode)
[ "$RECHECK_CODE" = "$FARMER_CODE" ] \
  && pass "Re-approval preserves the original farmerCode (idempotent)" \
  || fail "Re-approval changed the code: was $FARMER_CODE, now $RECHECK_CODE"

# ---------------------------------------------------------------------------
step "7. Agreements (Phase 1, FRD Section 9)"
# ---------------------------------------------------------------------------
api_call POST /agreements "$ADMIN_TOKEN" \
  "{\"farmerId\":\"$FARMER_ID\",\"cropName\":\"Wheat\",\"variety\":\"Sharbati\",\"expectedQuantity\":1000,\"purchaseRate\":25.50,\"agreementDate\":\"$TODAY\",\"qualityStandards\":\"Moisture below 12%\"}"
AGREEMENT_ID=$(printf '%s' "$RESP_BODY" | json_field id)
AGREEMENT_STATUS=$(printf '%s' "$RESP_BODY" | json_field status)

[ -n "$AGREEMENT_ID" ] && pass "Agreement created" \
                       || { fail "Agreement creation failed (HTTP $RESP_CODE)"; info "$RESP_BODY"; }

[ "$AGREEMENT_STATUS" = "PENDING" ] \
  && pass "Agreement defaults to PENDING status" \
  || fail "Expected PENDING, got '$AGREEMENT_STATUS'"

if [ -n "$AGREEMENT_ID" ]; then
  api_call PATCH "/agreements/$AGREEMENT_ID/status" "$ADMIN_TOKEN" "{\"status\":\"ACTIVE\"}"
  UPDATED=$(printf '%s' "$RESP_BODY" | json_field status)
  [ "$UPDATED" = "ACTIVE" ] && pass "Agreement status lifecycle works (PENDING -> ACTIVE)" \
                            || fail "Status update failed, got '$UPDATED'"
fi

# ---------------------------------------------------------------------------
step "8. Seed Distribution (Phase 1, FRD Section 10 - Agri Expert only)"
# ---------------------------------------------------------------------------
api_call POST /seed-distribution "$EXPERT_TOKEN" \
  "{\"farmerId\":\"$FARMER_ID\",\"seedName\":\"Certified Wheat Seed\",\"seedVariety\":\"HD-2967\",\"quantity\":50,\"unit\":\"KG\",\"batchNumber\":\"SEED-$STAMP\",\"distributionDate\":\"$TODAY\"}"
SEED_ID=$(printf '%s' "$RESP_BODY" | json_field id)

[ -n "$SEED_ID" ] && pass "Seed distribution logged by Agriculture Expert" \
                  || { fail "Seed distribution failed (HTTP $RESP_CODE)"; info "$RESP_BODY"; }

api_call GET "/seed-distribution?farmerId=$FARMER_ID" "$ADMIN_TOKEN"
[ "$RESP_CODE" = "200" ] && pass "Seed distribution history retrievable per farmer" \
                         || fail "Seed distribution list failed (HTTP $RESP_CODE)"

# ---------------------------------------------------------------------------
step "9. Training (Phase 1, FRD Section 11)"
# ---------------------------------------------------------------------------
api_call POST /training-sessions "$EXPERT_TOKEN" \
  "{\"title\":\"Kharif Best Practices\",\"description\":\"Seasonal training\",\"scheduledDate\":\"$TODAY\",\"branchId\":\"$BRANCH_ID\"}"
SESSION_ID=$(printf '%s' "$RESP_BODY" | json_field id)

[ -n "$SESSION_ID" ] && pass "Training session created" \
                     || { fail "Training session failed (HTTP $RESP_CODE)"; info "$RESP_BODY"; }

if [ -n "$SESSION_ID" ]; then
  api_call POST "/training-sessions/$SESSION_ID/attendance" "$EXPERT_TOKEN" \
    "{\"farmerIds\":[\"$FARMER_ID\",\"$FARMER2_ID\"]}"
  if [ "$RESP_CODE" = "201" ] || [ "$RESP_CODE" = "200" ]; then
    pass "Attendance marked for 2 farmers"
  else
    fail "Attendance marking failed (HTTP $RESP_CODE)"
  fi

  # Marking the same farmers again must not blow up on the unique constraint
  api_call POST "/training-sessions/$SESSION_ID/attendance" "$EXPERT_TOKEN" \
    "{\"farmerIds\":[\"$FARMER_ID\"]}"
  if [ "$RESP_CODE" = "201" ] || [ "$RESP_CODE" = "200" ]; then
    pass "Re-marking attendance is idempotent (upsert works)"
  else
    fail "Duplicate attendance should upsert, got HTTP $RESP_CODE"
  fi

  api_call POST "/training-sessions/$SESSION_ID/materials" "$EXPERT_TOKEN" \
    "{\"fileUrl\":\"https://storage.example.com/training/guide.pdf\",\"fileType\":\"pdf\"}"
  [ "$RESP_CODE" = "201" ] && pass "Training material attached" \
                           || fail "Material upload failed (HTTP $RESP_CODE)"
fi

# ---------------------------------------------------------------------------
step "10. Field Monitoring (Phase 1, FRD Section 12)"
# ---------------------------------------------------------------------------
api_call POST /field-visits "$EXPERT_TOKEN" \
  "{\"farmerId\":\"$FARMER_ID\",\"branchId\":\"$BRANCH_ID\",\"visitDate\":\"$TODAY\",\"cropName\":\"Wheat\",\"cropGrowthStage\":\"Flowering\",\"cropHealth\":\"Good\",\"pestStatus\":\"None observed\",\"fertilizerAdvice\":\"Apply urea in 10 days\",\"yieldPredictionQty\":950}"
VISIT_ID=$(printf '%s' "$RESP_BODY" | json_field id)

[ -n "$VISIT_ID" ] && pass "Field visit recorded with crop observations" \
                   || { fail "Field visit failed (HTTP $RESP_CODE)"; info "$RESP_BODY"; }

if [ -n "$VISIT_ID" ]; then
  api_call POST "/field-visits/$VISIT_ID/documents" "$EXPERT_TOKEN" \
    "{\"fileUrl\":\"https://storage.example.com/visits/crop.jpg\",\"fileType\":\"photo\"}"
  [ "$RESP_CODE" = "201" ] && pass "Field visit document attached" \
                           || fail "Document attach failed (HTTP $RESP_CODE)"
fi

# ---------------------------------------------------------------------------
step "11. Traceability - farmer profile aggregates all Phase 1 records"
# ---------------------------------------------------------------------------
api_call GET "/farmers/$FARMER_ID" "$ADMIN_TOKEN"

check_relation() {
  if printf '%s' "$RESP_BODY" | grep -q "\"$1\""; then
    pass "Farmer profile includes $1"
  else
    fail "Farmer profile missing $1"
  fi
}

if [ "$RESP_CODE" = "200" ]; then
  check_relation "verificationLogs"
  check_relation "agreements"
  check_relation "seedDistributions"
  check_relation "fieldVisits"

  if printf '%s' "$RESP_BODY" | grep -q "$FARMER_CODE"; then
    pass "Traceability chain intact - farmerCode $FARMER_CODE resolves to full history"
  else
    fail "farmerCode not present on farmer profile"
  fi
else
  fail "Could not fetch farmer profile (HTTP $RESP_CODE)"
fi

# ---------------------------------------------------------------------------
step "12. QR + Barcode generation (Phase 1, FRD 8.2 / 8.3)"
# ---------------------------------------------------------------------------
api_call GET "/farmers/$FARMER_ID/codes" "$ADMIN_TOKEN"
if [ "$RESP_CODE" = "200" ]; then
  pass "Codes endpoint returns 200 for an approved farmer"

  TRACE_URL=$(printf '%s' "$RESP_BODY" | json_field traceabilityUrl)
  if printf '%s' "$TRACE_URL" | grep -q "$FARMER_CODE"; then
    pass "Traceability URL embeds the farmerCode: $TRACE_URL"
  else
    fail "Traceability URL missing farmerCode (got '$TRACE_URL')"
  fi

  printf '%s' "$RESP_BODY" | grep -q "qrSvg"      && pass "Response includes qrSvg" \
                                                  || fail "Response missing qrSvg"
  printf '%s' "$RESP_BODY" | grep -q "barcodeSvg" && pass "Response includes barcodeSvg" \
                                                  || fail "Response missing barcodeSvg"
else
  fail "Codes endpoint failed (HTTP $RESP_CODE)"
fi

# QR must encode a URL, not raw data - so packaging never needs reprinting
api_call GET "/farmers/$FARMER_ID/qr.svg" "$ADMIN_TOKEN"
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q "<svg"; then
  pass "QR endpoint returns valid SVG"
else
  fail "QR endpoint failed (HTTP $RESP_CODE)"
fi

api_call GET "/farmers/$FARMER_ID/barcode.svg" "$ADMIN_TOKEN"
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q "<svg"; then
  pass "Barcode endpoint returns valid SVG"
  printf '%s' "$RESP_BODY" | grep -q "$FARMER_CODE" \
    && pass "Barcode carries human-readable farmerCode label" \
    || fail "Barcode missing human-readable label"
else
  fail "Barcode endpoint failed (HTTP $RESP_CODE)"
fi

# An unapproved farmer has no code, so code generation must refuse
api_call POST /farmers "$ADMIN_TOKEN" \
  "{\"fullName\":\"Unapproved Farmer\",\"mobile\":\"9000000000\",\"village\":\"Testpur\",\"district\":\"Test District\",\"state\":\"Maharashtra\",\"branchId\":\"$BRANCH_ID\"}"
PENDING_ID=$(printf '%s' "$RESP_BODY" | json_field id)

api_call GET "/farmers/$PENDING_ID/codes" "$ADMIN_TOKEN"
[ "$RESP_CODE" = "400" ] \
  && pass "Codes correctly refused for unapproved farmer (400)" \
  || fail "Expected 400 for unapproved farmer codes, got $RESP_CODE"

# ===========================================================================
# PHASE 2 - Procurement & Raw Material Control (FRD Sections 13-17)
# ===========================================================================

# ---------------------------------------------------------------------------
step "13. Warehouse master (Phase 2, FRD Section 16)"
# ---------------------------------------------------------------------------
api_call POST /warehouses "$ADMIN_TOKEN" \
  "{\"name\":\"Main Store $STAMP\",\"location\":\"Test District\",\"branchId\":\"$BRANCH_ID\",\"capacity\":50000}"
WAREHOUSE_ID=$(printf '%s' "$RESP_BODY" | json_field id)
[ -n "$WAREHOUSE_ID" ] && pass "Warehouse created" \
                      || { fail "Warehouse creation failed (HTTP $RESP_CODE)"; info "$RESP_BODY"; }

api_call POST /warehouses "$ADMIN_TOKEN" \
  "{\"name\":\"Secondary Store $STAMP\",\"location\":\"Test District\",\"branchId\":\"$BRANCH_ID\",\"capacity\":20000}"
WAREHOUSE2_ID=$(printf '%s' "$RESP_BODY" | json_field id)
[ -n "$WAREHOUSE2_ID" ] && pass "Second warehouse created (for transfer test)" \
                       || fail "Second warehouse failed (HTTP $RESP_CODE)"

# ---------------------------------------------------------------------------
step "14. Procurement planning + harvest inspection (FRD Section 13)"
# ---------------------------------------------------------------------------
api_call POST /procurement-plans "$ADMIN_TOKEN" \
  "{\"cropName\":\"Wheat\",\"plannedQuantity\":5000,\"scheduledFrom\":\"$TODAY\",\"scheduledTo\":\"$TODAY\",\"branchId\":\"$BRANCH_ID\"}"
PLAN_ID=$(printf '%s' "$RESP_BODY" | json_field id)
[ -n "$PLAN_ID" ] && pass "Procurement plan created" \
                 || fail "Procurement plan failed (HTTP $RESP_CODE)"

# Inspection against an unapproved farmer must be refused - no traceability code
api_call POST /harvest-inspections "$ADMIN_TOKEN" \
  "{\"farmerId\":\"$PENDING_ID\",\"cropName\":\"Wheat\",\"inspectionDate\":\"$TODAY\",\"result\":\"APPROVED\"}"
[ "$RESP_CODE" = "400" ] \
  && pass "Inspection refused for unapproved farmer (400)" \
  || fail "Expected 400 inspecting an unapproved farmer, got $RESP_CODE"

# A rejected inspection - used below to prove collection is gated on approval
api_call POST /harvest-inspections "$ADMIN_TOKEN" \
  "{\"farmerId\":\"$FARMER_ID\",\"cropName\":\"Wheat\",\"inspectionDate\":\"$TODAY\",\"moistureLevel\":18.5,\"result\":\"REJECTED\",\"remarks\":\"Moisture too high\"}"
REJECTED_INSP_ID=$(printf '%s' "$RESP_BODY" | json_field id)
[ -n "$REJECTED_INSP_ID" ] && pass "Rejected inspection recorded" \
                          || fail "Rejected inspection failed (HTTP $RESP_CODE)"

api_call POST /harvest-inspections "$ADMIN_TOKEN" \
  "{\"farmerId\":\"$FARMER_ID\",\"agreementId\":\"$AGREEMENT_ID\",\"procurementPlanId\":\"$PLAN_ID\",\"cropName\":\"Wheat\",\"inspectionDate\":\"$TODAY\",\"moistureLevel\":11.2,\"foreignMatter\":0.5,\"grainSize\":\"Medium\",\"result\":\"APPROVED\"}"
INSPECTION_ID=$(printf '%s' "$RESP_BODY" | json_field id)
[ -n "$INSPECTION_ID" ] && pass "Approved inspection recorded with quality checklist" \
                       || { fail "Approved inspection failed (HTTP $RESP_CODE)"; info "$RESP_BODY"; }

# ---------------------------------------------------------------------------
step "15. Collection gating - only APPROVED harvests may be collected (FRD 13.5)"
# ---------------------------------------------------------------------------
api_call POST /collections "$ADMIN_TOKEN" \
  "{\"inspectionId\":\"$REJECTED_INSP_ID\",\"branchId\":\"$BRANCH_ID\",\"collectionDate\":\"$TODAY\",\"grossWeight\":100,\"netWeight\":95,\"purchaseRate\":25}"
[ "$RESP_CODE" = "400" ] \
  && pass "Collection refused for a REJECTED inspection (400)" \
  || fail "Expected 400 collecting a rejected harvest, got $RESP_CODE"

# ---------------------------------------------------------------------------
step "16. Raw material collection + batch generation (FRD Sections 14-15)"
# ---------------------------------------------------------------------------
api_call POST /collections "$ADMIN_TOKEN" \
  "{\"inspectionId\":\"$INSPECTION_ID\",\"branchId\":\"$BRANCH_ID\",\"collectionDate\":\"$TODAY\",\"collectionLocation\":\"Farm gate\",\"grossWeight\":1050,\"netWeight\":1000,\"warehouseId\":\"$WAREHOUSE_ID\"}"
COLLECTION_ID=$(printf '%s' "$RESP_BODY" | json_field id)
RECEIPT_NO=$(printf '%s' "$RESP_BODY" | json_field receiptNumber)

if [ -n "$COLLECTION_ID" ]; then
  pass "Collection recorded (receipt: $RECEIPT_NO)"
else
  fail "Collection failed (HTTP $RESP_CODE)"
  info "$RESP_BODY"
fi

BATCH_NO=$(printf '%s' "$RESP_BODY" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print((d.get('batch') or {}).get('batchNumber',''))
except Exception:
    print('')
")

if printf '%s' "$BATCH_NO" | grep -qE "^RM-[0-9]{8}-[0-9]{3}$"; then
  pass "Batch number generated in correct format: $BATCH_NO"
else
  fail "Batch number malformed - expected RM-YYYYMMDD-NNN, got '$BATCH_NO'"
fi

# Rate should have come from the agreement (25.50) since none was supplied
RATE=$(printf '%s' "$RESP_BODY" | json_field purchaseRate)
info "Purchase rate applied: $RATE (from agreement fallback)"

# Same harvest must not be collectable twice
api_call POST /collections "$ADMIN_TOKEN" \
  "{\"inspectionId\":\"$INSPECTION_ID\",\"branchId\":\"$BRANCH_ID\",\"collectionDate\":\"$TODAY\",\"grossWeight\":100,\"netWeight\":90,\"purchaseRate\":25}"
[ "$RESP_CODE" = "400" ] \
  && pass "Double collection of the same harvest refused (400)" \
  || fail "Expected 400 on duplicate collection, got $RESP_CODE"

# ---------------------------------------------------------------------------
step "17. Inventory ledger (FRD Sections 16-17)"
# ---------------------------------------------------------------------------
api_call GET "/warehouses/stock?warehouseId=$WAREHOUSE_ID" "$ADMIN_TOKEN"
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q "$BATCH_NO"; then
  pass "Stock booked into warehouse on collection"
else
  fail "Batch not found in warehouse stock (HTTP $RESP_CODE)"
fi

api_call GET "/warehouses/movements?warehouseId=$WAREHOUSE_ID" "$ADMIN_TOKEN"
if [ "$RESP_CODE" = "200" ] && printf '%s' "$RESP_BODY" | grep -q "STOCK_IN"; then
  pass "STOCK_IN movement logged automatically on collection"
else
  fail "No STOCK_IN movement found (HTTP $RESP_CODE)"
fi

api_call GET "/warehouses/$WAREHOUSE_ID/status" "$ADMIN_TOKEN"
OCCUPIED=$(printf '%s' "$RESP_BODY" | json_field occupied)
[ "$RESP_CODE" = "200" ] && pass "Warehouse status reports occupancy: $OCCUPIED" \
                         || fail "Warehouse status failed (HTTP $RESP_CODE)"

# Resolve internal batch id for stock operations
api_call GET "/batches?warehouseId=$WAREHOUSE_ID" "$ADMIN_TOKEN"
BATCH_ID=$(printf '%s' "$RESP_BODY" | python3 -c "
import sys, json
try:
    rows = json.load(sys.stdin)
    print(rows[0]['id'] if rows else '')
except Exception:
    print('')
")

if [ -n "$BATCH_ID" ]; then
  # Over-drawing must be refused
  api_call POST "/warehouses/$WAREHOUSE_ID/stock-out" "$ADMIN_TOKEN" \
    "{\"batchId\":\"$BATCH_ID\",\"quantity\":999999,\"reason\":\"should fail\"}"
  [ "$RESP_CODE" = "400" ] \
    && pass "Over-drawing stock refused (400)" \
    || fail "Expected 400 over-drawing stock, got $RESP_CODE"

  # Transfer between warehouses
  api_call POST /warehouses/transfer "$ADMIN_TOKEN" \
    "{\"batchId\":\"$BATCH_ID\",\"fromWarehouseId\":\"$WAREHOUSE_ID\",\"toWarehouseId\":\"$WAREHOUSE2_ID\",\"quantity\":200,\"reason\":\"Rebalancing\"}"
  [ "$RESP_CODE" = "201" ] || [ "$RESP_CODE" = "200" ] \
    && pass "Stock transferred between warehouses" \
    || fail "Transfer failed (HTTP $RESP_CODE)"

  # Same-warehouse transfer is nonsense and must be refused
  api_call POST /warehouses/transfer "$ADMIN_TOKEN" \
    "{\"batchId\":\"$BATCH_ID\",\"fromWarehouseId\":\"$WAREHOUSE_ID\",\"toWarehouseId\":\"$WAREHOUSE_ID\",\"quantity\":10}"
  [ "$RESP_CODE" = "400" ] \
    && pass "Same-warehouse transfer refused (400)" \
    || fail "Expected 400 on same-warehouse transfer, got $RESP_CODE"

  # Adjustment must record a reason
  api_call POST "/warehouses/$WAREHOUSE_ID/adjust" "$ADMIN_TOKEN" \
    "{\"batchId\":\"$BATCH_ID\",\"newQuantity\":780,\"reason\":\"Physical count variance\"}"
  [ "$RESP_CODE" = "201" ] || [ "$RESP_CODE" = "200" ] \
    && pass "Stock adjustment recorded with reason" \
    || fail "Adjustment failed (HTTP $RESP_CODE)"

  api_call GET "/warehouses/movements?batchId=$BATCH_ID" "$ADMIN_TOKEN"
  if printf '%s' "$RESP_BODY" | grep -q "ADJUSTMENT" \
     && printf '%s' "$RESP_BODY" | grep -q "TRANSFER"; then
    pass "Movement ledger captures TRANSFER and ADJUSTMENT"
  else
    fail "Movement ledger incomplete"
  fi
else
  fail "Could not resolve batch id - skipping stock operation checks"
fi

# ---------------------------------------------------------------------------
step "18. End-to-end traceability: batch -> farmer (the QR promise)"
# ---------------------------------------------------------------------------
api_call GET "/batches/$BATCH_NO/trace" "$ADMIN_TOKEN"
if [ "$RESP_CODE" = "200" ]; then
  pass "Batch trace resolves"

  printf '%s' "$RESP_BODY" | grep -q "$FARMER_CODE" \
    && pass "Trace reaches the originating farmer ($FARMER_CODE)" \
    || fail "Trace does not reach the farmer code"

  printf '%s' "$RESP_BODY" | grep -q "Ramesh Kumar" \
    && pass "Trace includes farmer name" \
    || fail "Trace missing farmer name"

  printf '%s' "$RESP_BODY" | grep -q "Testpur" \
    && pass "Trace includes farm village (farm origin)" \
    || fail "Trace missing farm location"

  printf '%s' "$RESP_BODY" | grep -q "inspection" \
    && pass "Trace includes the harvest inspection record" \
    || fail "Trace missing inspection"

  printf '%s' "$RESP_BODY" | grep -q "stockMovements" \
    && pass "Trace includes stock movement history" \
    || fail "Trace missing stock movements"
else
  fail "Batch trace failed (HTTP $RESP_CODE)"
fi

# ---------------------------------------------------------------------------
echo ""
echo "${BLUE}=============================================${RESET}"
echo "  ${GREEN}Passed: $PASS${RESET}    ${RED}Failed: $FAIL${RESET}"
echo "${BLUE}=============================================${RESET}"

if [ "$FAIL" -eq 0 ]; then
  echo "${GREEN}All checks passed - Phases 0, 1 and 2 are working end to end.${RESET}"
  exit 0
else
  echo "${RED}$FAIL check(s) failed - see output above.${RESET}"
  exit 1
fi
