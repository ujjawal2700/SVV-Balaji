#!/usr/bin/env python3
"""
End-to-end check of the Affiliate Marketing system against a RUNNING API
(mock OTP, PAYMENT_GATEWAY=mock). Run it on a FRESH throwaway database - see
the "e2e needs a fresh DB" note in DEV_LOG.md; never the hosted .env database.

  A  Super Admin: program settings + per-category commission matrix (sub-category inherits)
  B  Applications: apply, pending link does not track, reject with reason, re-apply, approve
  C  Link tracking: HTTP-only signed aff_tracker cookie, 30 days, last click wins, forged cookie ignored
  D  Checkout: commission per ITEM at its category rate on (price x qty - coupon share); GST, fee, coins excluded
  E  Self-referral: same customer / shared phone / affiliate's own UPI -> FRAUD, no commission
  F  Partial return (returns workflow + staff record-return): per-item pro-rata deduction -> REFUNDED
  G  Hold window: delivered + inside 7 days stays PENDING; open return blocks maturity; cancelled order -> CANCELLED
  H  Payouts: due list, stale amount refused, payout settles matured commission, clawback after payout
  I  Suspend stops tracking; affiliate dashboard numbers; trace of the shipped pack still resolves

  BASE_URL=http://localhost:3110/api/v1 SEED_SUPER_ADMIN_PASSWORD=... python e2e-affiliate-flow.py
"""
import json
import os
import time
import urllib.error
import urllib.request
from datetime import date

BASE = os.environ.get("BASE_URL", "http://localhost:3110/api/v1")
EMAIL = os.environ.get("SEED_SUPER_ADMIN_EMAIL", "admin@svvbalaji.com")
PASSWORD = os.environ.get("SEED_SUPER_ADMIN_PASSWORD", "admin@123")
STAMP = str(int(time.time()))
TODAY = date.today().isoformat()
failures = 0
token = ""
pay_n = [0]


def call(method, path, body=None, tok=None, auth=True, headers=None, raw_response=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    t = tok if tok is not None else (token if auth else None)
    if t:
        req.add_header("Authorization", f"Bearer {t}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode()
            out = json.loads(raw) if raw else None
            return (res.status, out, res.headers) if raw_response else (res.status, out)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            out = json.loads(raw)
        except ValueError:
            out = raw
        return (e.code, out, e.headers) if raw_response else (e.code, out)


def step(t):
    print(f"\n==> {t}")


def check(ok, msg_, detail=None):
    global failures
    if ok:
        print(f"  PASS {msg_}")
    else:
        failures += 1
        print(f"  FAIL {msg_}")
        if detail is not None:
            print(f"       {json.dumps(detail, default=str)[:900]}")


def must(method, path, body=None, expect=(200, 201), tok=None, auth=True, headers=None):
    s, d = call(method, path, body, tok=tok, auth=auth, headers=headers)
    if s not in expect:
        print(f"  !! {method} {path} -> {s}: {json.dumps(d, default=str)[:900]}")
        raise SystemExit(1)
    return d


def rows(d):
    return d.get("data", d.get("rows", d)) if isinstance(d, dict) else d


def msg(d):
    if isinstance(d, dict):
        m = d.get("message")
        return " ".join(m) if isinstance(m, list) else str(m)
    return str(d)


def pay(prefix="mockpay_"):
    pay_n[0] += 1
    return {"gatewayPaymentId": f"{prefix}{STAMP}_{pay_n[0]}", "signature": "mock_signature"}


def wait_for(fn, timeout=12):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(0.4)
    return None


def paise_apportion(total, weights):
    """Same largest-remainder split as checkout.calculator / affiliate.logic."""
    s = sum(weights)
    if s <= 0 or total <= 0:
        return [0] * len(weights)
    raw = [total * w / s for w in weights]
    floors = [int(r) for r in raw]
    left = total - sum(floors)
    for i in sorted(range(len(raw)), key=lambda i: (-(raw[i] - int(raw[i])), i)):
        if left <= 0:
            break
        if floors[i] < weights[i]:
            floors[i] += 1
            left -= 1
    return floors


def near(a, b):
    return abs(float(a) - float(b)) < 0.005


# ------------------------------------------------------------------------- setup
step("0. Login, nodes, categories, stock through the real chain")
_, lg = call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD}, auth=False)
token = lg["accessToken"]
BR = rows(must("GET", "/branches"))[0]["id"]
WH_C = must("POST", "/warehouses", {"name": f"Aff Depot {STAMP}", "location": "Bhopal", "branchId": BR, "capacity": 99999, "kind": "CENTRAL", "city": "Bhopal", "state": "Madhya Pradesh"})["id"]
OUTLET_LL = (23.2599, 77.4126)
WH_O = must("POST", "/warehouses", {"name": f"Aff Outlet {STAMP}", "location": "Arera Colony", "branchId": BR, "capacity": 5000, "kind": "OUTLET",
                                    "city": "Bhopal", "state": "Madhya Pradesh", "latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1], "serviceRadiusKm": 5})["id"]
must("PATCH", "/checkout-settings", {"centralWarehouseId": WH_C, "localRadiusKm": 5, "codEnabled": True, "codMaxAmount": 50000, "reservationTtlMinutes": 15})
must("PATCH", "/return-settings/B2C", {"returnEnabled": True, "exchangeEnabled": True, "returnWindowHours": 168, "exchangeWindowHours": 168, "mediaRequired": False,
                                       "qcRequired": True, "autoApprove": False, "returnShippingPayer": "COMPANY", "returnShippingFee": 0, "restockingFeePercent": 0,
                                       "restockOnQcPass": True, "allowedRefundMethods": ["WALLET", "UPI", "BANK"], "defaultRefundMethod": "WALLET",
                                       "nonReturnableProductIds": [], "nonExchangeableProductIds": []})
REASONS = {r["code"]: r for r in must("GET", "/return-settings/reasons")}
farmer = must("POST", "/farmers", {
    "fullName": f"Aff Farmer {STAMP}", "mobile": f"96{STAMP[-8:]}", "village": "Ashta", "district": "Sehore", "state": "Madhya Pradesh",
    "farmSizeAcres": 5, "cropDetails": "Wheat", "branchId": BR, "aadhaarNumber": f"{STAMP}56"[:12], "address": "Ashta",
    "landType": "Irrigated", "irrigationType": "Canal", "bankAccountName": "F", "bankName": "SBI", "bankAccountNo": f"{STAMP}02", "ifscCode": "SBIN0001234",
})
must("PATCH", f"/farmers/{farmer['id']}/verify", {"action": "APPROVED"})

CAT_STAPLES = must("POST", "/categories", {"name": f"Staples {STAMP}", "slug": f"staples-{STAMP}"})
CAT_ATTA = must("POST", "/categories", {"name": f"Atta {STAMP}", "slug": f"atta-{STAMP}", "parentId": CAT_STAPLES["id"]})
CAT_MASALA = must("POST", "/categories", {"name": f"Masalas {STAMP}", "slug": f"masalas-{STAMP}"})


def make_product(label, b2c, category=None):
    body = {"name": f"{label} {STAMP}", "sku": f"{label.replace(' ', '-').upper()}-{STAMP}", "unit": "PACK", "showOnStorefront": True}
    if category:
        body["categoryId"] = category["id"]
    p = must("POST", "/products", body)
    must("POST", "/price-lists", {"productId": p["id"], "channel": "B2C", "customerType": "CONSUMER", "unitPrice": b2c, "gstRatePercent": 5, "effectiveFrom": TODAY})
    return p


def make_fg(p, packs, wh):
    insp = must("POST", "/harvest-inspections", {"farmerId": farmer["id"], "cropName": "Wheat", "inspectionDate": TODAY, "moistureLevel": 11, "foreignMatter": 0.4, "grainSize": "Medium", "result": "APPROVED"})
    coll = must("POST", "/collections", {"inspectionId": insp["id"], "branchId": BR, "collectionDate": TODAY, "collectionLocation": "Gate", "grossWeight": 1300, "netWeight": 1200, "warehouseId": WH_C, "purchaseRate": 25})
    rm = next(b for b in rows(must("GET", f"/batches?warehouseId={WH_C}")) if b.get("collectionId") == coll["id"])
    recipe = must("POST", "/recipes", {"recipeCode": f"R-{p['sku']}-{packs}", "productId": p["id"], "name": p["name"], "productionType": "SINGLE_GRAIN", "batchYieldQuantity": 1100,
                                       "ingredients": [{"cropName": "Wheat", "quantity": 1200, "unit": "KG"}]})
    must("PATCH", f"/recipes/{recipe['id']}/approve", {})
    pb = must("POST", "/production-batches", {"recipeId": recipe["id"], "branchId": BR, "warehouseId": WH_C, "productionDate": TODAY, "plannedQuantity": 600,
                                              "consumptions": [{"rawMaterialBatchId": rm["id"], "quantityUsed": 600}]})
    must("PATCH", f"/production-batches/{pb['id']}/complete", {"actualQuantity": 580})
    fg = must("POST", "/finished-goods", {"productionBatchId": pb["id"], "packagingType": "pouch", "netWeight": 0.25, "packCount": packs, "mrp": 300,
                                          "packagingDate": TODAY, "manufacturingDate": TODAY, "shelfLifeDays": 120})
    must("POST", "/quality-inspections", {"stage": "FINISHED_GOODS", "finishedGoodsBatchId": fg["id"], "productAppearance": "Good", "productWeight": 0.25, "result": "PASS"})
    must("PATCH", f"/quality-inspections/release/{fg['id']}", {"warehouseId": wh})
    return fg


ATTA = make_product("Aff Atta", 100, CAT_ATTA)        # Atta inherits Staples 1.5%
MASALA = make_product("Aff Masala", 50, CAT_MASALA)   # Masalas 6%
OIL = make_product("Aff Oil", 80)                     # no category -> program default (0%)
FG_ATTA = make_fg(ATTA, 120, WH_O)
FG_MASALA = make_fg(MASALA, 120, WH_O)
FG_OIL = make_fg(OIL, 60, WH_O)
must("POST", "/coupons", {"code": f"AFF{STAMP[-6:]}", "title": "Flat 50", "type": "FIXED", "value": 50, "minOrderValue": 0, "audience": "ALL", "perCustomerLimit": 50})
COUPON = f"AFF{STAMP[-6:]}"

rphone = f"7{STAMP[-6:]}601"
r = must("POST", "/rider/auth/signup", {"fullName": "Aff Rider", "phone": rphone, "password": "Secret#123", "vehicleType": "MOTORCYCLE", "vehicleNumber": "mp04 af 1"}, auth=False)
rs = must("POST", "/rider/auth/verify", {"phone": rphone, "code": r["devCode"]}, auth=False)
RIDER = {"id": rs["rider"]["id"], "tok": rs["accessToken"]}
for d in must("GET", "/rider/verification", tok=RIDER["tok"])["documents"]:
    if d["mandatory"] and not d["satisfied"]:
        doc = must("POST", "/rider/verification/documents", {"typeId": d["type"]["id"], "fileUrls": ["https://example.com/doc.jpg"], "documentNumber": "DOC123",
                                                              "issuedBy": "Test Police Station", "issuedOn": "2026-01-01", "expiresOn": "2030-12-31"}, tok=RIDER["tok"])
        must("POST", f"/riders/documents/{doc['id']}/approve", {})
must("POST", f"/riders/{RIDER['id']}/approve", {"warehouseId": WH_O})
must("POST", "/rider/availability", {"online": True, "latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1]}, tok=RIDER["tok"])
check(True, "outlet stocked (farmer -> production -> QA release), rider online, coupon created")


def new_account(tag, name):
    phone = f"8{STAMP[-6:]}{tag:03d}"
    call("POST", "/storefront/auth/otp/request", {"phone": phone}, auth=False)
    _, sess = call("POST", "/storefront/auth/otp/verify", {"phone": phone, "code": "123456", "audience": "CUSTOMER", "fullName": name}, auth=False)
    tok = sess["accessToken"]
    me = must("GET", "/storefront/auth/me", tok=tok)
    return {"tok": tok, "id": me["customer"]["id"], "phone": phone, "cookie": None}


LOCAL_LL = (23.2750, 77.4250)


def add_address(c, phone="9000011111"):
    return must("POST", "/storefront/addresses", {"label": "Home", "fullName": "Buyer", "phone": phone, "line1": "12 Test Street", "city": "Bhopal",
                                                  "state": "Madhya Pradesh", "pincode": "462016", "latitude": LOCAL_LL[0], "longitude": LOCAL_LL[1]}, tok=c["tok"])["id"]


def visit(c, code, path="/"):
    """The storefront's ?aff=CODE handler: POST /track, keep whatever cookie the server sets (like a browser)."""
    s, d, h = call("POST", "/storefront/affiliate/track", {"code": code, "landingPath": path}, auth=False, raw_response=True,
                   headers={"Cookie": f"aff_tracker={c['cookie']}"} if c.get("cookie") else None)
    sc = h.get("Set-Cookie") if h else None
    if sc and sc.startswith("aff_tracker="):
        c["cookie"] = sc.split(";")[0].split("=", 1)[1]
    return s, d, sc


def place(c, addr, lines, mode="ONLINE", extra=None, payment=None):
    body = {"addressId": addr, "items": [{"productId": p["id"], "quantity": q} for p, q in lines], "paymentMode": mode}
    body.update(extra or {})
    headers = {"Cookie": f"aff_tracker={c['cookie']}"} if c.get("cookie") else None
    sess = must("POST", "/storefront/checkout/sessions", body, tok=c["tok"], headers=headers)
    conf = (payment or pay()) if sess["payment"]["requiresPayment"] else {}
    placed = must("POST", f"/storefront/checkout/sessions/{sess['sessionId']}/confirm", conf, tok=c["tok"])
    return {"id": placed["orderId"], "number": placed["orderNumber"], "quote": sess["quote"]}


def accept_offer(task_kind):
    def find():
        for of in must("GET", "/rider/offers", tok=RIDER["tok"]):
            if of.get("kind") == task_kind:
                return of
        return None
    of = wait_for(find)
    if of:
        must("POST", f"/rider/offers/{of['offerId']}/accept", tok=RIDER["tok"])
    return of


def deliver_local(o, c):
    plan = must("POST", f"/orders/{o['id']}/start-packing", {})
    for p in plan["plan"]:
        must("POST", f"/orders/{o['id']}/scan", {"code": p["fgBatchNumber"]})
    of = accept_offer("ORDER_DELIVERY")
    tid = of["taskId"]
    for a in ("arrived-pickup", "picked-up", "start", "arrived"):
        must("POST", f"/rider/tasks/{tid}/{a}", {}, tok=RIDER["tok"])
    otp = must("GET", f"/storefront/orders/{o['number']}", tok=c["tok"])["deliveryOtp"]
    must("POST", f"/rider/tasks/{tid}/deliver", {"otp": otp}, tok=RIDER["tok"])


def item_of(o, product):
    return next(i for i in must("GET", f"/orders/{o['id']}")["items"] if i["productId"] == product["id"])


def commissions_of(order_number, aff_id):
    return [c for c in rows(must("GET", f"/affiliates/commissions?affiliateId={aff_id}&pageSize=200")) if c["orderNumber"] == order_number]


def attribution_of(order_number):
    return next((a for a in must("GET", "/affiliates/attributions") if a["orderNumber"] == order_number), None)


def apply(c, name, upi):
    return must("POST", "/storefront/affiliate/apply", {"fullName": name, "email": f"{name.split()[0].lower()}{STAMP}@example.com", "promotionUrl": "https://instagram.com/x",
                                                        "payoutMethod": "UPI", "payoutUpiId": upi, "acceptTerms": True}, tok=c["tok"])


# ===================================================================== A. Settings
step("A. Super Admin: program settings and the category commission matrix")
st = must("PATCH", "/affiliate-settings", {"enabled": True, "cookieDays": 30, "holdDays": 7, "holdFrom": "ORDER_DATE", "defaultRatePercent": 0, "applyToB2B": False, "minPayoutAmount": 1})
check(st["holdDays"] == 7 and st["cookieDays"] == 30, "settings saved", st)
s, bad = call("PUT", "/affiliate-settings/category-rates", {"rates": [{"categoryId": CAT_MASALA["id"], "ratePercent": 75}]})
check(s == 400, "a rate above 50% is refused", msg(bad))
mx = must("PUT", "/affiliate-settings/category-rates", {"rates": [{"categoryId": CAT_STAPLES["id"], "ratePercent": 1.5}, {"categoryId": CAT_MASALA["id"], "ratePercent": 6}]})
atta_row = next(c for c in mx["categories"] if c["id"] == CAT_ATTA["id"])
check(atta_row["ratePercent"] is None and atta_row["effectiveRatePercent"] == 1.5 and atta_row["inheritedFrom"] == CAT_STAPLES["name"],
      "sub-category without its own rate inherits the parent's (Atta <- Staples 1.5%)", atta_row)

# ===================================================================== B. Applications
step("B. Applications: apply -> pending link does not track -> reject / re-apply -> approve")
AFF_A_ACC = new_account(1, "Asha Affiliate")
AFF_B_ACC = new_account(2, "Bala Blogger")
a = apply(AFF_A_ACC, "Asha Affiliate", "asha@okaxis")
b = apply(AFF_B_ACC, "Bala Blogger", "bala@okicici")
check(a["affiliate"]["status"] == "PENDING" and a["dashboard"] is None, "application is PENDING with no dashboard yet", a["affiliate"])
s, bad = call("POST", "/storefront/affiliate/apply", {"fullName": "Asha", "payoutUpiId": "asha@okaxis", "acceptTerms": True}, tok=AFF_A_ACC["tok"])
check(s == 409, "cannot apply twice", msg(bad))
CODE_A, CODE_B = a["affiliate"]["code"], b["affiliate"]["code"]
ID_A, ID_B = a["affiliate"]["id"], b["affiliate"]["id"]
probe = {"cookie": None}
s, d, sc = visit(probe, CODE_A)
check(d["tracked"] is False and sc is None, "a pending affiliate's link sets no cookie", d)
must("POST", f"/affiliates/{ID_B}/reject", {"reason": "Audience not relevant"})
mb = must("GET", "/storefront/affiliate/me", tok=AFF_B_ACC["tok"])
check(mb["affiliate"]["status"] == "REJECTED" and mb["affiliate"]["rejectionReason"] == "Audience not relevant", "applicant sees the rejection reason")
s, _ = call("POST", f"/affiliates/{ID_B}/approve", {})
check(s == 409, "a rejected application cannot be approved directly")
apply(AFF_B_ACC, "Bala Blogger", "bala@okicici")
check(must("GET", "/storefront/affiliate/me", tok=AFF_B_ACC["tok"])["affiliate"]["status"] == "PENDING", "re-applying puts it back in the queue (same code)")
pend = must("GET", "/affiliates?status=PENDING")
check({ID_A, ID_B} <= {x["id"] for x in pend}, "both are in the admin PENDING queue")
must("POST", f"/affiliates/{ID_A}/approve", {})
must("POST", f"/affiliates/{ID_B}/approve", {})
check(must("GET", "/storefront/affiliate/me", tok=AFF_A_ACC["tok"])["dashboard"] is not None, "approved -> affiliate dashboard available")


def inbox_titles(acc):
    d = must("GET", "/storefront/notifications", tok=acc["tok"])
    return [n["title"] for n in (d.get("items", d) if isinstance(d, dict) else d)]


check("You are now a Desi Tokri affiliate" in inbox_titles(AFF_A_ACC), "approval lands in the applicant's notification inbox")
check("Affiliate application not approved" in inbox_titles(AFF_B_ACC), "rejection was notified too")

step("B2. Public landing page data (no sign-in)")
pg = must("GET", "/storefront/affiliate/program", auth=False)
names = {r["category"] for r in pg["rates"]}
check(pg["enabled"] and pg["cookieDays"] == 30 and pg["holdDays"] == 7, "program rules are public", {k: pg[k] for k in ("enabled", "cookieDays", "holdDays")})
check(CAT_MASALA["name"] in names and CAT_ATTA["name"] in names and pg["maxRatePercent"] == 6,
      "rates published per category incl. the inherited Atta 1.5%; headline 'up to 6%'", pg["rates"][:5])
check(CAT_STAPLES["name"] not in names, "a category with no products of its own is not advertised")

# ===================================================================== C. Tracking
step("C. Link tracking: HTTP-only signed cookie, 30 days, last click wins")
BUYER = new_account(10, "Genuine Buyer")
BUY_ADDR = add_address(BUYER)
s, d, sc = visit(BUYER, CODE_A, "/product-detail/x")
check(d["tracked"] and d["affiliateCode"] == CODE_A, "A's link tracked", d)
low = (sc or "").lower()
check("httponly" in low and "max-age=2592000" in low and "samesite=lax" in low and "path=/" in low,
      "cookie is HttpOnly, SameSite=Lax, Path=/, Max-Age 30 days", sc)
cookie_a = BUYER["cookie"]
s, d, sc = visit(BUYER, CODE_B)
check(d["tracked"] and BUYER["cookie"] != cookie_a, "B's link overwrites the cookie (last click wins)")
s, d, _ = visit({"cookie": None}, "NOSUCHCODE")
check(d["tracked"] is False, "unknown code: nothing tracked")
FORGER = new_account(11, "Forger")
FORGER_ADDR = add_address(FORGER, phone="9000022222")
FORGER["cookie"] = cookie_a.split(".")[0] + ".AAAAforgedsignature"
OF = place(FORGER, FORGER_ADDR, [(MASALA, 2)], mode="COD")
time.sleep(0.5)
check(attribution_of(OF["number"]) is None, "a forged/edited cookie is ignored - the order is not attributed")

# ===================================================================== D. Checkout & commission
step("D. Order through B's link: commission per item at its category rate, on price x qty - coupon share")
O1 = place(BUYER, BUY_ADDR, [(ATTA, 3), (MASALA, 4), (OIL, 1)], extra={"couponCode": COUPON})
att = wait_for(lambda: attribution_of(O1["number"]))
check(att and att["status"] == "ATTRIBUTED" and att["affiliateCode"] == CODE_B, "order attributed to B (the last click), not A", att)
lines = {l["productId"]: l for l in O1["quote"]["lines"]}
gross = [round(lines[p["id"]]["unitPrice"] * 100) * lines[p["id"]]["quantity"] for p in (ATTA, MASALA, OIL)]
shares = paise_apportion(5000, gross)
expect = {ATTA["id"]: (gross[0], shares[0], 1.5), MASALA["id"]: (gross[1], shares[1], 6.0)}
cs = commissions_of(O1["number"], ID_B)
check(len(cs) == 2, "two commission rows: Atta + Masala; Oil (0% default) earns nothing", [c["productName"] for c in cs])
for c in cs:
    pid = ATTA["id"] if c["productName"].startswith("Aff Atta") else MASALA["id"]
    g, sh, rate = expect[pid]
    base = (g - sh) / 100
    check(near(c["grossAmount"], g / 100) and near(c["couponShare"], sh / 100) and near(c["baseAmount"], base) and c["ratePercent"] == rate
          and near(c["commissionAmount"], round(base * rate) / 100) and c["status"] == "PENDING",
          f"{c['productName'][:10]}: base {base:.2f} (gross {g/100:.2f} - coupon {sh/100:.2f}) x {rate}% = {c['commissionAmount']}", c)
atta_c = next(c for c in cs if c["productName"].startswith("Aff Atta"))
check(atta_c["rateSource"] == "PARENT_CATEGORY" and next(c for c in cs if c["productName"].startswith("Aff Masala"))["rateSource"] == "CATEGORY",
      "rate source recorded (inherited vs own)")
tax = O1["quote"]["totals"]["tax"]
check(tax > 0 and near(att["baseTotal"], (sum(gross) - 5000) / 100), "GST (and delivery fee) are not in the base", {"tax": tax, "baseTotal": att["baseTotal"]})
rel = cs[0]["releaseDate"][:10]
check(cs[0]["releaseDate"] > cs[0]["orderDate"], f"release date = order date + 7 days ({rel})")

# ===================================================================== E. Self-referral
step("E. Self-referral: flagged as fraud, no commission, logged for admin")
visit(AFF_A_ACC, CODE_A)
A_ADDR = add_address(AFF_A_ACC, phone="9000033333")
OF1 = place(AFF_A_ACC, A_ADDR, [(MASALA, 2)], mode="COD")
f1 = wait_for(lambda: attribution_of(OF1["number"]))
check(f1 and f1["status"] == "FRAUD" and "SAME_CUSTOMER" in f1["fraudReasons"] and not commissions_of(OF1["number"], ID_A),
      "affiliate buying through their own link -> FRAUD (SAME_CUSTOMER), no commission", f1)
FRIEND = new_account(12, "Phone Sharer")
visit(FRIEND, CODE_A)
OF2 = place(FRIEND, add_address(FRIEND, phone=AFF_A_ACC["phone"]), [(MASALA, 2)], mode="COD")
f2 = wait_for(lambda: attribution_of(OF2["number"]))
check(f2 and f2["status"] == "FRAUD" and f2["fraudReasons"] == ["PHONE_MATCH"], "shipping phone = affiliate's phone -> FRAUD (PHONE_MATCH)", f2)
PAYER = new_account(13, "UPI Sharer")
visit(PAYER, CODE_A)
OF3 = place(PAYER, add_address(PAYER, phone="9000044444"), [(MASALA, 2)], payment=pay("mockpay_upi_asha@okaxis_"))
f3 = wait_for(lambda: attribution_of(OF3["number"]))
check(f3 and f3["status"] == "FRAUD" and f3["fraudReasons"] == ["PAYMENT_MATCH"], "paid from the affiliate's payout UPI id -> FRAUD (PAYMENT_MATCH)", f3)
fl = must("GET", "/affiliates/attributions?status=FRAUD")
check({OF1["number"], OF2["number"], OF3["number"]} <= {x["orderNumber"] for x in fl}, "all three in the admin fraud log")

# ===================================================================== F. Partial returns
step("F. Partial return of one item: pro-rata deduction from the pending balance")
deliver_local(O1, BUYER)
masala_c = next(c for c in commissions_of(O1["number"], ID_B) if c["productName"].startswith("Aff Masala"))
IT_M = item_of(O1, MASALA)
RA = must("POST", "/storefront/returns", {"orderNumber": O1["number"], "orderItemId": IT_M["id"], "type": "RETURN", "quantity": 1, "reasonId": REASONS["CHANGED_MIND"]["id"]}, tok=BUYER["tok"])
RA_ID = next(x["id"] for x in must("GET", f"/returns/customers?search={RA['requestNumber']}")["rows"])
must("POST", f"/returns/customers/{RA_ID}/approve", {})
pickup_otp = must("GET", f"/storefront/returns/{RA['requestNumber']}", tok=BUYER["tok"])["pickupOtp"]
of = accept_offer("RETURN_PICKUP")
must("POST", f"/rider/return-tasks/{of['taskId']}/start", {}, tok=RIDER["tok"])
must("POST", f"/rider/return-tasks/{of['taskId']}/arrived", {"latitude": LOCAL_LL[0], "longitude": LOCAL_LL[1]}, tok=RIDER["tok"])
must("POST", f"/rider/return-tasks/{of['taskId']}/collect", {"otp": pickup_otp}, tok=RIDER["tok"])
must("POST", f"/rider/return-tasks/{of['taskId']}/hand-in", {"latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1]}, tok=RIDER["tok"])
before_qc = next(c for c in commissions_of(O1["number"], ID_B) if c["productName"].startswith("Aff Masala"))
check(before_qc["refundedQuantity"] == 0, "nothing deducted before the goods are accepted back")
must("POST", f"/returns/customers/{RA_ID}/qc", {"decision": "ACCEPT", "goodQuantity": 1, "damagedQuantity": 0})
m1 = next(c for c in commissions_of(O1["number"], ID_B) if c["productName"].startswith("Aff Masala"))
one = round(masala_c["commissionAmount"] * 100 / 4) / 100
check(m1["refundedQuantity"] == 1 and near(m1["refundedAmount"], one) and m1["status"] == "PENDING",
      f"1 of 4 masala back -> {one} taken back, still PENDING for the other 3", m1)
atta_after = next(c for c in commissions_of(O1["number"], ID_B) if c["productName"].startswith("Aff Atta"))
check(atta_after["refundedQuantity"] == 0 and atta_after["status"] == "PENDING", "the other item's commission is untouched")
must("POST", f"/returns/customers/{RA_ID}/refund", {"refundMethod": "WALLET"})
must("POST", f"/orders/{O1['id']}/returns", {"items": [{"orderItemId": IT_M["id"], "quantity": 3}], "reason": "Staff recorded return"})
m2 = next(c for c in commissions_of(O1["number"], ID_B) if c["productName"].startswith("Aff Masala"))
check(m2["refundedQuantity"] == 4 and near(m2["refundedAmount"], masala_c["commissionAmount"]) and m2["status"] == "REFUNDED" and m2["netAmount"] == 0,
      "remaining 3 returned via staff record-return -> REFUNDED, nets to exactly 0", m2)
dash = must("GET", "/storefront/affiliate/me", tok=AFF_B_ACC["tok"])["dashboard"]
check(near(dash["balances"]["pending"], atta_after["commissionAmount"]) and near(dash["balances"]["reversed"], masala_c["commissionAmount"]),
      "pending balance = Atta commission only; reversed = all masala commission", dash["balances"])

# ===================================================================== G. Hold window
step("G. Hold window: delivered but inside 7 days stays PENDING; cancelled order -> CANCELLED")
due = must("GET", "/affiliate-payouts/due")
check(ID_B not in {x["id"] for x in due["data"]}, "B has nothing payable yet (inside the 7-day hold)")
check(next(c for c in commissions_of(O1["number"], ID_B) if c["productName"].startswith("Aff Atta"))["status"] == "PENDING", "delivered Atta commission still PENDING")
OC = place(BUYER, BUY_ADDR, [(MASALA, 2)], mode="COD")
wait_for(lambda: commissions_of(OC["number"], ID_B))
must("PATCH", f"/orders/{OC['id']}/cancel", {"reason": "customer changed mind"})
check(all(c["status"] == "CANCELLED" for c in commissions_of(OC["number"], ID_B)), "order cancelled -> its commission CANCELLED")

must("PATCH", "/affiliate-settings", {"holdDays": 0})
O2 = place(BUYER, BUY_ADDR, [(MASALA, 10)])
O3 = place(BUYER, BUY_ADDR, [(ATTA, 2)])
wait_for(lambda: commissions_of(O3["number"], ID_B))
check(commissions_of(O2["number"], ID_B)[0]["status"] == "PENDING", "hold over but NOT delivered -> still PENDING")
deliver_local(O2, BUYER)
deliver_local(O3, BUYER)
RB = must("POST", "/storefront/returns", {"orderNumber": O3["number"], "orderItemId": item_of(O3, ATTA)["id"], "type": "RETURN", "quantity": 1,
                                          "reasonId": REASONS["CHANGED_MIND"]["id"]}, tok=BUYER["tok"])
must("GET", "/affiliate-payouts/due")  # runs maturity
c2 = commissions_of(O2["number"], ID_B)[0]
c3 = commissions_of(O3["number"], ID_B)[0]
check(c2["status"] == "APPROVED" and c3["status"] == "PENDING", "delivered + past hold -> APPROVED; item with an OPEN return waits", [c2["status"], c3["status"]])
must("POST", f"/storefront/returns/{RB['requestNumber']}/cancel", {}, tok=BUYER["tok"])
must("GET", "/affiliate-payouts/due")
check(commissions_of(O3["number"], ID_B)[0]["status"] == "APPROVED", "return cancelled -> it matures")

# ===================================================================== H. Payouts
step("H. Payout engine: matured balances, stale amount refused, settle, clawback after payout")
due = must("GET", "/affiliate-payouts/due")
row_b = next((x for x in due["data"] if x["id"] == ID_B), None)
expected = round(c2["commissionAmount"] + commissions_of(O3["number"], ID_B)[0]["commissionAmount"], 2)
check(row_b and near(row_b["balances"]["payable"], expected) and row_b["commissionCount"] == 2 and row_b["payoutDetailsComplete"],
      f"B owed {expected} (only matured rows; the pending Atta from O1 is excluded)", row_b and row_b["balances"])
s, bad = call("POST", "/affiliate-payouts", {"affiliateId": ID_B, "reference": "UTR123", "expectedNetAmount": expected + 1})
check(s == 409 and bad.get("code") == "BALANCE_CHANGED", "payout with a stale amount is refused", bad)
po = must("POST", "/affiliate-payouts", {"affiliateId": ID_B, "reference": f"UTR{STAMP}", "expectedNetAmount": expected, "note": "October"})
check(po["payoutNumber"].startswith("AFP-") and near(po["netAmount"], expected) and po["paidTo"] == "bala@okicici", "payout recorded to the affiliate's UPI", po)
check(all(c["status"] == "PAID" and c["payoutNumber"] == po["payoutNumber"] for c in commissions_of(O2["number"], ID_B) + commissions_of(O3["number"], ID_B)),
      "settled commission rows are PAID and linked to the payout")
s, _ = call("POST", "/affiliate-payouts", {"affiliateId": ID_B, "reference": "UTR-again", "expectedNetAmount": expected})
check(s == 409, "the same balance cannot be paid twice")
check(ID_B not in {x["id"] for x in must("GET", "/affiliate-payouts/due")["data"]}, "B no longer in the due list")
my_po = must("GET", "/storefront/affiliate/payouts", tok=AFF_B_ACC["tok"])
check(len(my_po) == 1 and my_po[0]["payoutNumber"] == po["payoutNumber"], "affiliate sees the payout")
check("Affiliate payout sent" in inbox_titles(AFF_B_ACC), "payout notified to the affiliate")

must("POST", f"/orders/{O2['id']}/returns", {"items": [{"orderItemId": item_of(O2, MASALA)["id"], "quantity": 5}], "reason": "late return after payout"})
c2b = commissions_of(O2["number"], ID_B)[0]
claw = round(c2["commissionAmount"] * 100 / 2) / 100
check(c2b["status"] == "PAID" and c2b["refundedQuantity"] == 5 and c2b["adjustments"][0]["clawback"] is True and near(c2b["adjustments"][0]["amount"], claw),
      f"return AFTER payout -> clawback of {claw} recorded, row stays PAID", c2b)
bal = must("GET", f"/affiliates/{ID_B}")["dashboard"]["balances"]
check(near(bal["clawbackDue"], claw) and near(bal["payable"], -claw), "clawback is owed against the next payout", bal)
O4 = place(BUYER, BUY_ADDR, [(MASALA, 20)])
deliver_local(O4, BUYER)
due = must("GET", "/affiliate-payouts/due")
row_b = next((x for x in due["data"] if x["id"] == ID_B), None)
c4 = commissions_of(O4["number"], ID_B)[0]
check(row_b and near(row_b["balances"]["payable"], c4["commissionAmount"] - claw), "next payout = new matured commission - clawback", row_b and row_b["balances"])
po2 = must("POST", "/affiliate-payouts", {"affiliateId": ID_B, "reference": f"UTR{STAMP}b", "expectedNetAmount": row_b["balances"]["payable"]})
check(near(po2["clawbackAmount"], claw) and near(po2["grossAmount"], c4["commissionAmount"]), "second payout recovered the clawback", po2)
check(near(must("GET", f"/affiliates/{ID_B}")["dashboard"]["balances"]["clawbackDue"], 0), "nothing left to recover")

# ===================================================================== I. Suspend + dashboard
step("I. Suspension, dashboard numbers, traceability")
must("POST", f"/affiliates/{ID_B}/suspend", {"reason": "policy review"})
s, d, _ = visit({"cookie": None}, CODE_B)
check(d["tracked"] is False, "suspended affiliate's links stop tracking")
O5 = place(BUYER, BUY_ADDR, [(MASALA, 2)], mode="COD")   # BUYER still holds B's cookie
time.sleep(0.5)
check(attribution_of(O5["number"]) is None, "an old cookie of a suspended affiliate earns nothing")
must("POST", f"/affiliates/{ID_B}/reactivate", {})
dash = must("GET", "/storefront/affiliate/me", tok=AFF_B_ACC["tok"])["dashboard"]
check(dash["clicks"] >= 1 and dash["successfulOrders"] == 4 and near(dash["balances"]["paid"], po["netAmount"] + po2["netAmount"]),
      "dashboard: clicks, successful (non-cancelled) orders, paid total", {k: dash[k] for k in ("clicks", "successfulOrders", "totalEarnings")})
s, _ = call("GET", "/affiliates", tok=AFF_B_ACC["tok"])
check(s == 401, "a customer token cannot reach the admin affiliate API")
tr = must("GET", f"/trace/{FG_MASALA['fgBatchNumber']}")
check(farmer["id"] in json.dumps(tr) or farmer["fullName"] in json.dumps(tr), "the shipped masala pack still traces back to the farmer")

print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILURE(S)'}")
raise SystemExit(1 if failures else 0)
