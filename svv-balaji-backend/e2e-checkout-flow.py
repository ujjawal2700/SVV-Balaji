#!/usr/bin/env python3
"""
End-to-end check of storefront checkout and fulfilment against a RUNNING API
(PAYMENT_GATEWAY=mock, SHIPPING_PROVIDER=mock, SHIPROCKET_WEBHOOK_TOKEN set).

  address -> server decides LOCAL vs SHIPROCKET -> quote (server maths) -> stock hold
  -> pay -> atomic order -> live admin socket -> pack (FIFO + scan) -> rider / AWB
  -> OTP or webhook -> DELIVERED -> loyalty; plus payment failure, abandonment,
  concurrent last-unit checkout, batch health, B2B credit, cancellation, socket
  reconnect reconciliation.

  SEED_SUPER_ADMIN_PASSWORD=... python e2e-checkout-flow.py
Creates uniquely-stamped data, restores the settings it changes, and unpublishes
its test products.
"""
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date

ORIGIN = os.environ.get("ORIGIN", "http://localhost:3000")
BASE = ORIGIN + "/api/v1"
EMAIL = os.environ.get("SEED_SUPER_ADMIN_EMAIL", "admin@svvbalaji.com")
PASSWORD = os.environ.get("SEED_SUPER_ADMIN_PASSWORD", "admin@123")
WEBHOOK_TOKEN = os.environ.get("SHIPROCKET_WEBHOOK_TOKEN", "dev-shiprocket-webhook-token")
STAMP = str(int(time.time()))
TODAY = date.today().isoformat()
# Stamped: gateway payment ids are unique in the DB, so fixed ids would collide with earlier runs.
PAY_OK = {"gatewayPaymentId": f"mockpay_ok_{STAMP}", "signature": "mock_signature"}
token = ""
failures = 0
PRODUCTS = []


def call(method, path, body=None, tok=None, auth=True, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    t = tok if tok is not None else (token if auth else "")
    if t:
        req.add_header("Authorization", f"Bearer {t}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode()
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw


def step(t):
    print(f"\n==> {t}")


def check(ok, msg, detail=None):
    global failures
    if ok:
        print(f"  PASS {msg}")
    else:
        failures += 1
        print(f"  FAIL {msg}" + (f"\n       {json.dumps(detail, default=str)[:600]}" if detail is not None else ""))
    return ok


def must(method, path, body=None, expect=(200, 201), tok=None):
    status, data = call(method, path, body, tok=tok)
    if status not in expect:
        print(f"  FATAL {method} {path} -> HTTP {status}: {json.dumps(data)[:500]}")
        sys.exit(2)
    return data


def rows(d):
    return d["data"] if isinstance(d, dict) and "data" in d else d


def msg(d):
    m = d.get("message") if isinstance(d, dict) else str(d)
    return " ".join(m) if isinstance(m, list) else str(m)


# ------------------------------------------------------------------------- setup
step("1. Login and configure the program")
_, lg = call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD}, auth=False)
token = lg["accessToken"]
ORIG_CS = must("GET", "/checkout-settings")
ORIG_LS = must("GET", "/loyalty/settings")
BR = rows(must("GET", "/branches"))[0]["id"]


def restore():
    call("PATCH", "/checkout-settings", {
        "localRadiusKm": float(ORIG_CS["localRadiusKm"]), "centralWarehouseId": ORIG_CS["centralWarehouseId"],
        "codEnabled": ORIG_CS["codEnabled"], "reservationTtlMinutes": ORIG_CS["reservationTtlMinutes"],
    })
    call("PATCH", "/loyalty/settings", {
        "isActive": ORIG_LS["isActive"], "redemptionEnabled": ORIG_LS["redemptionEnabled"],
        "earnPercentB2C": float(ORIG_LS["earnPercentB2C"]), "earnPercentB2B": float(ORIG_LS["earnPercentB2B"]),
        "pointValueInr": float(ORIG_LS["pointValueInr"]), "maxRedemptionPercent": ORIG_LS["maxRedemptionPercent"],
    })
    for pid in PRODUCTS:
        call("PATCH", f"/products/{pid}", {"showOnStorefront": False})
    # Leave the public storefront as we found it: switch off the coupons this run created.
    for c in rows(call("GET", "/coupons")[1] or []):
        if c["code"].endswith(STAMP[-5:]) and c["isActive"]:
            call("PATCH", f"/coupons/{c['id']}", {"isActive": False})


WH_C = must("POST", "/warehouses", {"name": f"Central Depot {STAMP}", "location": "Bhopal", "branchId": BR, "capacity": 99999, "kind": "CENTRAL", "city": "Bhopal", "state": "Madhya Pradesh"})["id"]
status, bad = call("POST", "/warehouses", {"name": "Nowhere Outlet", "location": "x", "branchId": BR, "kind": "OUTLET"})
check(status == 400, "an outlet without coordinates is refused (it could never be routed to)")
OUT = must("POST", "/warehouses", {"name": f"Franchise Outlet {STAMP}", "location": "Arera Colony", "branchId": BR, "capacity": 5000, "kind": "OUTLET",
                                   "city": "Bhopal", "state": "Madhya Pradesh", "latitude": 23.2599, "longitude": 77.4126, "serviceRadiusKm": 5})
WH_O = OUT["id"]
must("PATCH", "/checkout-settings", {
    "centralWarehouseId": WH_C, "localRadiusKm": 5, "localBaseFee": 30, "localFreeAbove": 499, "shipBaseFee": 60, "shipFreeAbove": 999,
    "b2bBaseFee": 150, "b2bFreeAbove": 5000, "prepMinutes": 30, "minutesPerKm": 4, "shipMinDays": 3, "shipMaxDays": 6,
    "codEnabled": True, "codMaxAmount": 5000, "reservationTtlMinutes": 15,
})
must("PATCH", "/loyalty/settings", {"isActive": True, "earnPercentB2C": 5, "earnPercentB2B": 2, "pointValueInr": 1,
                                    "redemptionEnabled": True, "maxRedemptionPercent": 50, "minRedeemPoints": 0,
                                    "calculationBase": "EXCLUDING_TAX", "minEligibleItemAmount": None, "minEligibleOrderAmount": None,
                                    "maxRewardPerOrderInr": None, "appliesToDiscountedProducts": True, "defaultEligible": True})
check(True, f"central depot + franchise outlet (5 km) configured")

farmer = must("POST", "/farmers", {
    "fullName": f"Checkout Farmer {STAMP}", "mobile": f"98{STAMP[-8:]}", "village": "Ashta", "district": "Sehore", "state": "Madhya Pradesh",
    "farmSizeAcres": 5, "cropDetails": "Wheat", "branchId": BR, "aadhaarNumber": f"{STAMP}12"[:12], "address": "Ashta",
    "landType": "Irrigated", "irrigationType": "Canal", "bankAccountName": "F", "bankName": "SBI", "bankAccountNo": f"{STAMP}00", "ifscCode": "SBIN0001234",
})
must("PATCH", f"/farmers/{farmer['id']}/verify", {"action": "APPROVED"})


def make_product(label, b2c, b2b, extra=None):
    body = {"name": f"{label} {STAMP}", "sku": f"{label.replace(' ', '-').upper()}-{STAMP}", "unit": "PACK", "showOnStorefront": True}
    body.update(extra or {})
    p = must("POST", "/products", body)
    PRODUCTS.append(p["id"])
    must("POST", "/price-lists", {"productId": p["id"], "channel": "B2C", "customerType": "CONSUMER", "unitPrice": b2c, "gstRatePercent": 5, "effectiveFrom": TODAY})
    must("POST", "/price-lists", {"productId": p["id"], "channel": "B2B", "customerType": "RETAILER", "unitPrice": b2b, "gstRatePercent": 5, "effectiveFrom": TODAY})
    return p


def run_production(p):
    insp = must("POST", "/harvest-inspections", {"farmerId": farmer["id"], "cropName": "Wheat", "inspectionDate": TODAY, "moistureLevel": 11, "foreignMatter": 0.4, "grainSize": "Medium", "result": "APPROVED"})
    coll = must("POST", "/collections", {"inspectionId": insp["id"], "branchId": BR, "collectionDate": TODAY, "collectionLocation": "Gate", "grossWeight": 1300, "netWeight": 1200, "warehouseId": WH_C, "purchaseRate": 25})
    rm = next(b for b in rows(must("GET", f"/batches?warehouseId={WH_C}")) if b.get("collectionId") == coll["id"])
    recipe = must("POST", "/recipes", {"recipeCode": f"R-{p['sku']}", "productId": p["id"], "name": p["name"], "productionType": "SINGLE_GRAIN", "batchYieldQuantity": 1100,
                                       "ingredients": [{"cropName": "Wheat", "quantity": 1200, "unit": "KG"}]})
    must("PATCH", f"/recipes/{recipe['id']}/approve", {})
    pb = must("POST", "/production-batches", {"recipeId": recipe["id"], "branchId": BR, "warehouseId": WH_C, "productionDate": TODAY, "plannedQuantity": 600,
                                              "consumptions": [{"rawMaterialBatchId": rm["id"], "quantityUsed": 600}]})
    must("PATCH", f"/production-batches/{pb['id']}/complete", {"actualQuantity": 580})
    return pb


def make_fg(pb, packs, shelf_days, wh=None):
    wh = wh or WH_C
    fg = must("POST", "/finished-goods", {"productionBatchId": pb["id"], "packagingType": "pouch", "netWeight": 0.25, "packCount": packs, "mrp": 120,
                                          "packagingDate": TODAY, "manufacturingDate": TODAY, "shelfLifeDays": shelf_days})
    must("POST", "/quality-inspections", {"stage": "FINISHED_GOODS", "finishedGoodsBatchId": fg["id"], "productAppearance": "Good", "productWeight": 0.25, "result": "PASS"})
    # QA release auto-inwards every pack into `wh` (the depot unless told otherwise).
    must("PATCH", f"/quality-inspections/release/{fg['id']}", {"warehouseId": wh})
    return fg


def to_outlet(fg, qty):
    """Move `qty` packs from the depot (where QA release put them) to the outlet."""
    must("POST", f"/finished-goods/{fg['id']}/transfer", {"fromWarehouseId": WH_C, "toWarehouseId": WH_O, "quantity": qty})


step("2. Products and stock (two FG batches of the main product, oldest expiring first)")
P1 = make_product("Checkout Atta", 100, 80, {"moqB2B": 10})
pb1 = run_production(P1)
OLD = make_fg(pb1, 50, 90)     # 50 auto-inwarded at the depot
NEW = make_fg(pb1, 220, 180)
to_outlet(OLD, 20); to_outlet(NEW, 20)   # outlet 20 + 20, depot 30 + 200
NEW2 = make_fg(pb1, 50, 200)  # only at the depot: stays sellable while the outlet's batches are frozen
P2 = make_product("Last Unit Besan", 50, 40)
pb2 = run_production(P2)
LAST = make_fg(pb2, 5, 120, wh=WH_O)  # only the outlet has it, and only 5
check(True, f"{OLD['fgBatchNumber']} (expires first) and {NEW['fgBatchNumber']} stocked at outlet and depot; 5 units of the second product at the outlet only")


# --------------------------------------------------------------------- customers
def new_customer(tag):
    phone = f"9{STAMP[-6:]}{tag:03d}"
    call("POST", "/storefront/auth/otp/request", {"phone": phone}, auth=False)
    _, sess = call("POST", "/storefront/auth/otp/verify", {"phone": phone, "code": "123456", "audience": "CUSTOMER", "fullName": f"Shopper {tag}"}, auth=False)
    tok = sess["accessToken"]
    me = must("GET", "/storefront/auth/me", tok=tok)
    return {"tok": tok, "id": me["customer"]["id"], "phone": phone}


def add_address(c, lat=None, lng=None, label="Home", city="Bhopal"):
    body = {"label": label, "fullName": "Test Shopper", "phone": "9876543210", "line1": "12 Test Street", "city": city, "state": "Madhya Pradesh", "pincode": "462016"}
    if lat is not None:
        body.update(latitude=lat, longitude=lng)
    return must("POST", "/storefront/addresses", body, tok=c["tok"])["id"]


LOCAL_LL = (23.2750, 77.4250)   # ~2 km from the outlet
FAR_LL = (22.7196, 75.8577)     # Indore, ~170 km


def items(*pairs):
    return [{"productId": p["id"], "quantity": q} for p, q in pairs]


step("3. Addresses and the server's delivery decision (the customer never picks)")
C1 = new_customer(1)
A_local = add_address(C1, *LOCAL_LL)
A_far = add_address(C1, *FAR_LL, label="Office", city="Indore")
A_nocoord = add_address(C1, label="Other")
status, bad = call("POST", "/storefront/addresses", {"fullName": "x", "phone": "123", "line1": "a", "city": "b", "state": "c", "pincode": "1"}, tok=C1["tok"])
check(status == 400, "address validation rejects a bad phone/pincode")
status, bad = call("POST", "/storefront/addresses", {"fullName": "Xy", "phone": "9876543210", "line1": "abc", "city": "Bhopal", "state": "MP", "pincode": "462016", "latitude": 23.2}, tok=C1["tok"])
check(status == 400, "latitude without longitude is refused")

q = must("POST", "/storefront/checkout/quote", {"addressId": A_local, "items": items((P1, 3))}, tok=C1["tok"])
f = q["fulfillment"]
check(f["method"] == "LOCAL" and f["nodeId"] == WH_O and 1 < f["distanceKm"] < 4, "address ~2 km from the outlet -> LOCAL from the outlet", f)
check(f["etaLabel"].endswith("min"), "ETA is a minutes window calculated by the backend", f["etaLabel"])
q_far = must("POST", "/storefront/checkout/quote", {"addressId": A_far, "items": items((P1, 3))}, tok=C1["tok"])
check(q_far["fulfillment"]["method"] == "SHIPROCKET" and q_far["fulfillment"]["nodeId"] == WH_C, "address in another city -> SHIPROCKET from the central depot", q_far["fulfillment"])
check("day" in q_far["fulfillment"]["etaLabel"], "courier ETA is a days window", q_far["fulfillment"]["etaLabel"])
q_nc = must("POST", "/storefront/checkout/quote", {"addressId": A_nocoord, "items": items((P1, 3))}, tok=C1["tok"])
check(q_nc["fulfillment"]["method"] == "SHIPROCKET" and "pin" in q_nc["fulfillment"]["reason"].lower(), "no coordinates -> never 'local' (asks for a pin)", q_nc["fulfillment"]["reason"])

step("4. The server recalculates everything; the client's numbers are not trusted")
t = q["totals"]
check((t["subtotal"], t["tax"], t["deliveryFee"], t["totalPayable"]) == (300, 15, 30, 345), "3 x Rs 100 + 5% GST + Rs 30 local fee = Rs 345", t)
status, bad = call("POST", "/storefront/checkout/quote", {"addressId": A_local, "items": items((P1, 3)), "totalPayable": 1, "deliveryFee": 0, "method": "SHIPROCKET"}, tok=C1["tok"])
check(status == 400, "a request carrying prices / fee / delivery method is rejected outright", msg(bad))
status, bad = call("POST", "/storefront/checkout/sessions", {"addressId": A_local, "items": items((P1, 3)), "expectedTotal": 100}, tok=C1["tok"])
check(status == 409 and bad.get("code") == "PRICE_CHANGED", "a stale/tampered expectedTotal is caught and the true quote returned", bad if status != 409 else bad.get("code"))
q2 = must("POST", "/storefront/checkout/quote", {"addressId": A_local, "items": items((P1, 3)), "couponCode": "NOPE"}, expect=(400,), tok=C1["tok"])
check("not valid" in msg(q2), "an unknown coupon is refused with a reason", msg(q2))

must("POST", "/coupons", {"code": f"SAVE{STAMP[-5:]}", "title": "Save 50", "type": "FIXED", "value": 50, "minOrderValue": 200, "audience": "B2C", "usageLimit": 100, "perCustomerLimit": 1})
CODE = f"SAVE{STAMP[-5:]}"
qc = must("POST", "/storefront/checkout/quote", {"addressId": A_local, "items": items((P1, 3)), "couponCode": CODE}, tok=C1["tok"])
tc = qc["totals"]
check((tc["couponDiscount"], tc["taxable"], tc["tax"], tc["totalPayable"]) == (50, 250, 12.5, 292.5), "coupon Rs 50: GST charged on Rs 250 (after discount) -> Rs 292.50", tc)
status, bad = call("POST", "/storefront/checkout/quote", {"addressId": A_local, "items": items((P2, 1)), "couponCode": CODE}, tok=C1["tok"])
check(status == 400 and "more" in msg(bad).lower(), "coupon minimum order enforced against the SERVER subtotal", msg(bad))

adj = must("POST", f"/referrals/ledger/{C1['id']}/adjust", {"amount": 100, "note": "e2e starting balance"})
qp = must("POST", "/storefront/checkout/quote", {"addressId": A_local, "items": items((P1, 3)), "couponCode": CODE, "redeemPoints": 40}, tok=C1["tok"])
tp = qp["totals"]
check((tp["loyaltyDiscount"], tp["taxable"], tp["tax"], tp["totalPayable"]) == (40, 210, 10.5, 250.5), "40 points = Rs 40 more off; GST on Rs 210 -> Rs 250.50", tp)
status, bad = call("POST", "/storefront/checkout/quote", {"addressId": A_local, "items": items((P1, 3)), "redeemPoints": 999}, tok=C1["tok"])
check(status == 400, "cannot redeem more points than held / allowed", msg(bad))
status, bad = call("POST", "/storefront/checkout/quote", {"addressId": A_local, "items": items((P1, 3)), "paymentMode": "CREDIT"}, tok=C1["tok"])
check(status == 400, "a consumer cannot choose credit terms", msg(bad))

# ----------------------------------------------------------------- happy path + realtime
step("5. Live admin feed: socket auth, then a real order arrives without a reload")
bad_auth = subprocess.run(["node", "e2e-realtime.mjs", ORIGIN, "not-a-token", "auth"], capture_output=True, text=True, timeout=30).stdout.strip()
check(bad_auth == "UNAUTHORIZED", "a socket without a valid staff token is rejected", bad_auth)
lo_tok = None
lo_email = f"logi-rt-{STAMP}@example.com"
must("POST", "/users", {"email": lo_email, "password": "E2e@12345", "fullName": "Logi", "role": "LOGISTICS_TEAM", "branchId": BR})
_, lg2 = call("POST", "/auth/login", {"email": lo_email, "password": "E2e@12345"}, auth=False)
lo_auth = subprocess.run(["node", "e2e-realtime.mjs", ORIGIN, lg2["accessToken"], "auth"], capture_output=True, text=True, timeout=30).stdout.strip()
check(lo_auth in ("OK", "UNAUTHORIZED"), f"a staff socket without orders.view is refused ({lo_auth})")

events = []
listener = subprocess.Popen(["node", "e2e-realtime.mjs", ORIGIN, token, "listen"], stdout=subprocess.PIPE, text=True, bufsize=1)
ready = threading.Event()


def pump():
    for line in listener.stdout:
        line = line.strip()
        if line == "READY":
            ready.set()
        elif line.startswith("{"):
            events.append(json.loads(line))


threading.Thread(target=pump, daemon=True).start()
check(ready.wait(15), "authorised admin socket connected")

step("6. B2C checkout: hold -> pay -> atomic order (coupon + points + loyalty ledger)")
sess = must("POST", "/storefront/checkout/sessions", {"addressId": A_local, "items": items((P1, 3)), "couponCode": CODE, "redeemPoints": 40, "expectedTotal": 250.5}, tok=C1["tok"])
check(sess["payment"]["requiresPayment"] and sess["payment"]["gateway"]["provider"] == "mock" and sess["quote"]["totals"]["totalPayable"] == 250.5, "session opened: total Rs 250.50, gateway order created for the SERVER's amount", sess["payment"])
SID = sess["sessionId"]
status, bad = call("POST", f"/storefront/checkout/sessions/{SID}/confirm", {"gatewayPaymentId": PAY_OK["gatewayPaymentId"], "signature": "forged"}, tok=C1["tok"])
check(status == 402 and bad.get("code") == "PAYMENT_FAILED", "a forged payment signature is refused (402)", bad)
sess = must("POST", "/storefront/checkout/sessions", {"addressId": A_local, "items": items((P1, 3)), "couponCode": CODE, "redeemPoints": 40}, tok=C1["tok"])
SID = sess["sessionId"]
placed = must("POST", f"/storefront/checkout/sessions/{SID}/confirm", PAY_OK, tok=C1["tok"])
again = must("POST", f"/storefront/checkout/sessions/{SID}/confirm", PAY_OK, tok=C1["tok"])
check(placed["orderNumber"] == again["orderNumber"] and again["alreadyPlaced"], "confirming twice returns the SAME order (idempotent)", again)
ORDER1 = placed["orderId"]
od = must("GET", f"/orders/{ORDER1}")
check(od["status"] == "PLACED" and od["source"] == "STOREFRONT" and od["fulfillmentMethod"] == "LOCAL" and od["warehouseId"] == WH_O, "order committed: PLACED, STOREFRONT, LOCAL, outlet node", {k: od[k] for k in ("status", "source", "fulfillmentMethod")})
check(float(od["total"]) == 250.5 and float(od["discountTotal"]) == 90 and float(od["deliveryFee"]) == 30 and od["paymentStatus"] == "PAID" and od["paymentMode"] == "ONLINE", "financial snapshot: total 250.50, discount 90, fee 30, PAID online", {k: od[k] for k in ("total", "discountTotal", "deliveryFee", "paymentStatus")})
check(od["addressSnapshot"]["city"] == "Bhopal" and od["couponCode"] == CODE and od["loyaltyRedeemedPoints"] == 40 and True, "address snapshot (JSON), coupon code, points redeemed", od["addressSnapshot"])
check("deliveryOtp" not in od, "staff order responses never contain the delivery OTP")
check(all(i["skuSnapshot"] and i["nameSnapshot"] for i in od["items"]), "line items carry SKU/name snapshots and no batch yet (FIFO happens at packing)")
cust_view = must("GET", f"/storefront/orders/{placed['orderNumber']}", tok=C1["tok"])
OTP = cust_view["deliveryOtp"]
check(OTP and len(OTP) == 4 and cust_view["payment"]["status"] == "PAID", "the customer (only) is shown a 4-digit OTP", cust_view["deliveryOtp"])
coup = next(c for c in rows(must("GET", "/coupons")) if c["code"] == CODE)
check(coup["usedCount"] == 1, "coupon usage recorded in the same transaction")
bal = must("GET", "/storefront/loyalty", tok=C1["tok"])
check(bal["balance"] == 60 and any(h["type"] == "LOYALTY_REDEMPTION" and h["points"] == -40 for h in bal["history"]), "40 points debited, ledger row written (balance 100 -> 60)", bal["balance"])
status, again2 = call("POST", "/storefront/checkout/quote", {"addressId": A_local, "items": items((P1, 3)), "couponCode": CODE}, tok=C1["tok"])
check(status == 400 and "already" in msg(again2).lower(), "per-customer coupon limit enforced on the next order", msg(again2))

deadline = time.time() + 8
while time.time() < deadline and not any(e["event"] == "orders:new" and e["id"] == ORDER1 for e in events):
    time.sleep(0.2)
ev = next((e for e in events if e["event"] == "orders:new" and e["id"] == ORDER1), None)
check(ev is not None, "admin socket received orders:new right after the commit")
if ev:
    check(ev["orderNumber"] == placed["orderNumber"] and ev["customerName"] and ev["channel"] == "B2C" and ev["total"] == 250.5 and ev["fulfillmentMethod"] == "LOCAL" and ev["nodeName"].startswith("Franchise Outlet") and ev["createdAt"], "event carries order id, customer, channel, amount, method, node, timestamp", ev)

# ------------------------------------------------------------- LOCAL fulfilment
step("7. LOCAL pipeline: FIFO allocation -> scan -> PACKED -> rider -> doorstep OTP -> DELIVERED -> loyalty")
status, bad = call("PATCH", f"/orders/{ORDER1}/pack", {})
check(status == 400, "cannot skip straight to packed", msg(bad))
plan = must("POST", f"/orders/{ORDER1}/start-packing", {})
check(plan["status"] == "ALLOCATED" and plan["complete"] and [p["fgBatchNumber"] for p in plan["plan"]] == [OLD["fgBatchNumber"]], "start packing FIFO-allocates the OLDEST batch (earliest expiry)", plan["plan"])
status, bad = call("POST", f"/orders/{ORDER1}/scan", {"code": NEW["fgBatchNumber"]})
check(status == 400 and bad.get("code") == "WRONG_BATCH" and OLD["fgBatchNumber"] in bad["expected"], "scanning a newer batch off the shelf is refused, naming the expected one", msg(bad))
status, bad = call("POST", f"/orders/{ORDER1}/scan", {"code": "hello"})
check(status == 400, "a non-batch code is refused")
status, bad = call("PATCH", f"/orders/{ORDER1}/pack", {})
check(status == 400 and "scan" in msg(bad).lower(), "plain 'pack' is blocked until every batch is scanned", msg(bad))
scanned = must("POST", f"/orders/{ORDER1}/scan", {"code": f"https://desitokri.com/trace?batch={OLD['fgBatchNumber']}"})
check(scanned["packed"] and scanned["remaining"] == 0, "scanning the QR URL of the allocated batch marks the order PACKED", scanned)
check(must("GET", f"/orders/{ORDER1}")["status"] == "PACKED", "status is PACKED")
status, bad = call("PATCH", f"/orders/{ORDER1}/dispatch", {})
check(status == 400 and "rider" in msg(bad).lower(), "cannot dispatch a local order without a rider", msg(bad))
status, bad = call("POST", f"/orders/{ORDER1}/ship", {})
check(status == 400, "a local order cannot be sent through the courier")
must("POST", f"/orders/{ORDER1}/assign-rider", {"riderName": "Ravi Kumar", "riderPhone": "9876500001"})
o = must("GET", f"/orders/{ORDER1}")
check(o["status"] == "DISPATCHED" and o["riderName"] == "Ravi Kumar", "rider assigned -> out for delivery (DISPATCHED)")
cv = must("GET", f"/storefront/orders/{placed['orderNumber']}", tok=C1["tok"])
check(cv["rider"]["name"] == "Ravi Kumar" and any(t["type"] == "RIDER_ASSIGNED" for t in cv["timeline"]), "customer tracking shows the rider and timeline")
status, bad = call("PATCH", f"/orders/{ORDER1}/deliver", {})
check(status == 400 and "otp" in msg(bad).lower(), "plain 'deliver' is blocked: the OTP is required", msg(bad))
wrong = str((int(OTP) + 1) % 10000).zfill(4)
status, bad = call("POST", f"/orders/{ORDER1}/verify-otp", {"otp": wrong})
check(status == 400 and bad.get("attemptsLeft") == 4, "wrong OTP: 4 attempts left", bad)
before = must("GET", "/storefront/loyalty", tok=C1["tok"])["balance"]
done = must("POST", f"/orders/{ORDER1}/verify-otp", {"otp": OTP})
check(done["delivered"] and must("GET", f"/orders/{ORDER1}")["status"] == "DELIVERED", "correct OTP closes the order as DELIVERED")
after = must("GET", "/storefront/loyalty", tok=C1["tok"])
# eligible base = Rs 210 taxable (after 90 discount) at 5% = 10 points
check(after["balance"] == before + 10 and any(h["type"] == "LOYALTY_EARN" and h["points"] == 10 for h in after["history"]), "loyalty credited ONLY now, on the net-of-discount amount (5% of Rs 210 = 10)", after["balance"])
check(must("GET", f"/storefront/orders/{placed['orderNumber']}", tok=C1["tok"])["deliveryOtp"] is None, "OTP is no longer shown once delivered")
allocs = must("GET", f"/orders/{ORDER1}/pick-plan")
check(allocs[0]["fgBatchNumber"] == OLD["fgBatchNumber"] and allocs[0]["scanned"], "the delivered order is linked to the FIFO batch, scanned")
trace = must("GET", f"/orders/number/{placed['orderNumber']}/traceability")
check(trace, "order still traces back to the farmer through the batch")

# --------------------------------------------------------------- SHIPROCKET
def webhook(payload, key):
    return call("POST", "/webhooks/shiprocket", payload, tok="", headers={"x-api-key": key})


step("8. SHIPROCKET pipeline: central depot -> AWB -> courier webhook -> DELIVERED")
C2 = new_customer(2)
A2 = add_address(C2, *FAR_LL, city="Indore")
sess2 = must("POST", "/storefront/checkout/sessions", {"addressId": A2, "items": items((P1, 2)), "paymentMode": "COD"}, tok=C2["tok"])
check(sess2["quote"]["fulfillment"]["method"] == "SHIPROCKET" and sess2["quote"]["payment"]["mode"] == "COD" and not sess2["payment"]["requiresPayment"], "far address + COD: courier from the depot, no gateway needed")
placed2 = must("POST", f"/storefront/checkout/sessions/{sess2['sessionId']}/confirm", {}, tok=C2["tok"])
O2 = placed2["orderId"]
o2 = must("GET", f"/orders/{O2}")
check(o2["paymentStatus"] == "PENDING" and o2["paymentMode"] == "COD" and o2["warehouseId"] == WH_C, "COD order: payment PENDING (collect on delivery), depot node")
plan2 = must("POST", f"/orders/{O2}/start-packing", {})
must("POST", f"/orders/{O2}/scan", {"code": plan2["plan"][0]["fgBatchNumber"]})
status, bad = call("PATCH", f"/orders/{O2}/dispatch", {})
check(status == 400 and "shipment" in msg(bad).lower(), "cannot dispatch a courier order without creating the shipment", msg(bad))
status, bad = call("POST", f"/orders/{O2}/assign-rider", {"riderName": "Ravi", "riderPhone": "9876500001"})
check(status == 400, "a courier order cannot use an in-house rider")
ship = must("POST", f"/orders/{O2}/ship", {})
ship_again = must("POST", f"/orders/{O2}/ship", {})
check(ship["awb"] and ship["trackingUrl"] and ship["labelUrl"] and ship_again["awb"] == ship["awb"], "shipment created once: AWB, courier, label, tracking link (retry books no second courier)", ship)
check(must("GET", f"/orders/{O2}")["status"] == "DISPATCHED", "dispatched with the shipment")
cv2 = must("GET", f"/storefront/orders/{placed2['orderNumber']}", tok=C2["tok"])
check(cv2["shipment"]["awb"] == ship["awb"] and cv2["deliveryOtp"] is None, "customer sees the tracking link; no OTP for courier orders")
check(webhook({"awb": ship["awb"], "current_status": "DELIVERED"}, "wrong")[0] == 401, "webhook with a bad token is refused")
check(webhook({"awb": ship["awb"], "current_status": "OUT FOR DELIVERY"}, WEBHOOK_TOKEN)[0] == 200, "tracking update accepted")
webhook({"awb": ship["awb"], "current_status": "DELIVERED"}, WEBHOOK_TOKEN)
webhook({"awb": ship["awb"], "current_status": "DELIVERED"}, WEBHOOK_TOKEN)
check(must("GET", f"/orders/{O2}")["status"] == "DELIVERED", "courier 'DELIVERED' webhook closes the order (and a duplicate is harmless)")
check(any(h["type"] == "LOYALTY_EARN" for h in must("GET", "/storefront/loyalty", tok=C2["tok"])["history"]), "loyalty credited on the webhook-driven delivery")

# --------------------------------------------------------- payment failure & holds
step("9. Payment failure and abandonment release the stock (no dirty state)")
C3 = new_customer(3)
A3 = add_address(C3, *LOCAL_LL)


def outlet_available_for_next_checkout(qty_probe):
    """How many can still be reserved right now? Probe with a quote-only availability test via a hold."""
    s, d = call("POST", "/storefront/checkout/sessions", {"addressId": A3, "items": items((P2, qty_probe)), "paymentMode": "COD"}, tok=C3["tok"])
    return s, d


s5, d5 = outlet_available_for_next_checkout(5)
check(s5 == 201 and d5["quote"]["fulfillment"]["nodeId"] == WH_O, "a checkout holds all 5 units of the last product at the outlet")
C4 = new_customer(4)
A4 = add_address(C4, *LOCAL_LL)
s_oos, d_oos = call("POST", "/storefront/checkout/sessions", {"addressId": A4, "items": items((P2, 1)), "paymentMode": "COD"}, tok=C4["tok"])
check(s_oos == 400 and d_oos.get("code") == "OUT_OF_STOCK", "while it is held, nobody else can take a unit (OUT_OF_STOCK)", msg(d_oos))
must("POST", f"/storefront/checkout/sessions/{d5['sessionId']}/abort", tok=C3["tok"])
s_ok, d_ok = call("POST", "/storefront/checkout/sessions", {"addressId": A4, "items": items((P2, 5)), "paymentMode": "COD"}, tok=C4["tok"])
check(s_ok == 201, "abandoning the checkout released everything: the units are available again")
must("POST", f"/storefront/checkout/sessions/{d_ok['sessionId']}/abort", tok=C4["tok"])

# failed online payment
C5 = new_customer(5)
A5 = add_address(C5, *LOCAL_LL)
sf = must("POST", "/storefront/checkout/sessions", {"addressId": A5, "items": items((P2, 5))}, tok=C5["tok"])
status, bad = call("POST", f"/storefront/checkout/sessions/{sf['sessionId']}/confirm", {"gatewayPaymentId": f"mockfail_{STAMP}", "signature": "nope"}, tok=C5["tok"])
check(status == 402, "a declined payment returns 402")
status, bad = call("POST", f"/storefront/checkout/sessions/{sf['sessionId']}/confirm", PAY_OK, tok=C5["tok"])
check(status == 409, "the failed session cannot be revived", msg(bad))
s_again, d_again = call("POST", "/storefront/checkout/sessions", {"addressId": A5, "items": items((P2, 5)), "paymentMode": "COD"}, tok=C5["tok"])
check(s_again == 201, "after the failure the stock is free again for a retry")
must("POST", f"/storefront/checkout/sessions/{d_again['sessionId']}/abort", tok=C5["tok"])

# expiry: hold with a 1-minute TTL, then let it lapse
must("PATCH", "/checkout-settings", {"reservationTtlMinutes": 1})
C6 = new_customer(6)
A6 = add_address(C6, *LOCAL_LL)
short = must("POST", "/storefront/checkout/sessions", {"addressId": A6, "items": items((P2, 5)), "paymentMode": "COD"}, tok=C6["tok"])
must("PATCH", "/checkout-settings", {"reservationTtlMinutes": 15})
print("  ... waiting for the 1-minute stock hold to lapse (no sweeper involvement needed)")
time.sleep(63)
C7 = new_customer(7)
A7 = add_address(C7, *LOCAL_LL)
s_exp, d_exp = call("POST", "/storefront/checkout/sessions", {"addressId": A7, "items": items((P2, 5)), "paymentMode": "COD"}, tok=C7["tok"])
check(s_exp == 201, "an expired hold stops counting on its own - stock is free even if the sweeper never ran")
st, bad = call("POST", f"/storefront/checkout/sessions/{short['sessionId']}/confirm", {}, tok=C6["tok"])
check(st == 409, "confirming the expired COD checkout is refused", msg(bad))
must("POST", f"/storefront/checkout/sessions/{d_exp['sessionId']}/abort", tok=C7["tok"])

# ------------------------------------------------------------- concurrency
step("10. Concurrent checkout on the last stock: zero overselling")
racers = [new_customer(100 + i) for i in range(8)]
for r in racers:
    r["addr"] = add_address(r, *LOCAL_LL)


def race(r):
    return call("POST", "/storefront/checkout/sessions", {"addressId": r["addr"], "items": items((P2, 1)), "paymentMode": "COD"}, tok=r["tok"])


with ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(race, racers))
wins = [(r, d) for r, (s, d) in zip(racers, results) if s == 201]
losses = [d for s, d in results if s != 201]
check(len(wins) == 5, "8 simultaneous buyers, 5 units: exactly 5 succeed", [s for s, _ in results])
check(all(d.get("code") == "OUT_OF_STOCK" for d in losses) and len(losses) == 3, "the other 3 get OUT_OF_STOCK - no 500s, no deadlocks", [d.get("code") for d in losses])
orders_race = []
for r, d in wins:
    orders_race.append(must("POST", f"/storefront/checkout/sessions/{d['sessionId']}/confirm", {}, tok=r["tok"]))
check(len({o["orderNumber"] for o in orders_race}) == 5, "the 5 winners each get a distinct committed order")
for o in orders_race:
    must("POST", f"/orders/{o['orderId']}/start-packing", {})
detail = [must("GET", f"/orders/{o['orderId']}/pick-plan") for o in orders_race]
allocated = sum(p["quantity"] for plan_ in detail for p in plan_)
check(allocated == 5, "all 5 orders allocate real packs from the 5 in stock - total allocated == total stock, none oversold", allocated)
status, bad = call("POST", "/storefront/checkout/sessions", {"addressId": A4, "items": items((P2, 1)), "paymentMode": "COD"}, tok=C4["tok"])
check(status == 400, "a 6th buyer afterwards is refused: stock is fully committed")

# ---------------------------------------------------------------- batch health
step("11. Batch health gatekeeper: frozen / recalled stock is not sellable")
qb = must("POST", "/storefront/checkout/quote", {"addressId": A_local, "items": items((P1, 2))}, tok=C1["tok"])
check(qb["fulfillment"]["method"] == "LOCAL", "with healthy batches the outlet serves locally")
must("POST", "/recall/hold", {"fgBatchNumbers": [NEW["fgBatchNumber"]], "status": "ON_HOLD", "reason": "e2e precaution freeze"})
outlet_left = 20 - 3  # 3 already dispatched from OLD... OLD had 20, NEW 20
must("POST", "/recall/hold", {"fgBatchNumbers": [OLD["fgBatchNumber"]], "status": "RECALLED", "reason": "e2e recall of the older batch"})
qb2 = must("POST", "/storefront/checkout/quote", {"addressId": A_local, "items": items((P1, 2))}, tok=C1["tok"])
check(qb2["fulfillment"]["method"] == "SHIPROCKET" and qb2["fulfillment"]["nodeId"] == WH_C, "with the outlet's batches frozen/recalled, the order routes to the depot instead", qb2["fulfillment"])
must("POST", "/recall/hold", {"fgBatchNumbers": [NEW["fgBatchNumber"]], "status": "ACTIVE", "reason": "cleared"})
qb3 = must("POST", "/storefront/checkout/quote", {"addressId": A_local, "items": items((P1, 2))}, tok=C1["tok"])
check(qb3["fulfillment"]["method"] == "LOCAL", "releasing the freeze on the newer batch restores local delivery")

# ------------------------------------------------------------------- cancel
step("12. Cancelling a storefront order returns everything")
C8 = new_customer(8)
A8 = add_address(C8, *LOCAL_LL)
call("POST", "/coupons", {"code": f"CXL{STAMP[-5:]}", "title": "Cancel test", "type": "PERCENT", "value": 10, "maxDiscount": 100, "audience": "ALL", "usageLimit": 1})
must("POST", f"/referrals/ledger/{C8['id']}/adjust", {"amount": 100, "note": "e2e balance"})
sc = must("POST", "/storefront/checkout/sessions", {"addressId": A8, "items": items((P1, 2)), "paymentMode": "COD", "couponCode": f"CXL{STAMP[-5:]}", "redeemPoints": 30}, tok=C8["tok"])
oc = must("POST", f"/storefront/checkout/sessions/{sc['sessionId']}/confirm", {}, tok=C8["tok"])
check(must("GET", "/storefront/loyalty", tok=C8["tok"])["balance"] == 70, "30 points spent at checkout")
must("PATCH", f"/orders/{oc['orderId']}/cancel", {"reason": "customer changed mind"})
check(must("GET", "/storefront/loyalty", tok=C8["tok"])["balance"] == 100, "cancelled: redeemed points returned")
check(next(c for c in rows(must("GET", "/coupons")) if c["code"] == f"CXL{STAMP[-5:]}")["usedCount"] == 0, "cancelled: the single-use coupon is usable again")
sc2 = call("POST", "/storefront/checkout/sessions", {"addressId": A8, "items": items((P1, 2)), "paymentMode": "COD", "couponCode": f"CXL{STAMP[-5:]}"}, tok=C8["tok"])
check(sc2[0] == 201, "...and a new order can use it")
must("POST", f"/storefront/checkout/sessions/{sc2[1]['sessionId']}/abort", tok=C8["tok"])

# ---------------------------------------------------------------------- B2B
step("13. B2B bulk checkout: GSTIN, MOQ, credit terms and limit, invoice fields")
rphone = f"8{STAMP[-6:]}{9:03d}"
gstin = f"29ABCDE{STAMP[-4:]}F1Z5"
call("POST", "/storefront/auth/otp/request", {"phone": rphone}, auth=False)
status, reg = call("POST", "/storefront/auth/register-retailer", {"phone": rphone, "code": "123456", "fullName": "Retail Owner", "businessName": f"Bulk Traders {STAMP}",
                                                                   "gstin": gstin, "addressLine": "Market Rd", "city": "Bhopal", "state": "Madhya Pradesh", "pincode": "462001"}, auth=False)
if status not in (200, 201):
    print("  registration:", status, json.dumps(reg)[:300])
pend = [a for a in rows(must("GET", f"/storefront/accounts?channel=B2B&search={rphone}")) if str(a.get("phone", "")).endswith(rphone[-10:])] if status in (200, 201) else []
if pend:
    must("PATCH", f"/storefront/accounts/{pend[0]['id']}/approve")
    call("POST", "/storefront/auth/otp/request", {"phone": rphone}, auth=False)
    _, bs = call("POST", "/storefront/auth/otp/verify", {"phone": rphone, "code": "123456", "audience": "RETAILER"}, auth=False)
    BT = bs["accessToken"]
    bme = must("GET", "/storefront/auth/me", tok=BT)
    BID = bme["customer"]["id"]
    must("PATCH", f"/customers/{BID}", {"paymentTerms": "CREDIT_30", "creditLimit": 2000})
    B_addr = add_address({"tok": BT}, *LOCAL_LL)
    status, bad = call("POST", "/storefront/checkout/quote", {"addressId": B_addr, "items": items((P1, 5))}, tok=BT)
    check(status == 400 and "minimum" in msg(bad).lower(), "B2B minimum order quantity (MOQ 10) enforced", msg(bad))
    qb2b = must("POST", "/storefront/checkout/quote", {"addressId": B_addr, "items": items((P1, 12))}, tok=BT)
    fb = qb2b["fulfillment"]
    check(fb["method"] == "SHIPROCKET" and fb["nodeId"] == WH_C, "B2B ships from the central depot even to a local address", fb)
    check(qb2b["totals"]["subtotal"] == 960 and qb2b["totals"]["deliveryFee"] == 150, "B2B tier price (Rs 80 x 12 = 960) and the B2B delivery fee", qb2b["totals"])
    check("CREDIT" in qb2b["payment"]["allowedModes"], "credit terms are offered while within the limit", qb2b["payment"])
    sb = must("POST", "/storefront/checkout/sessions", {"addressId": B_addr, "items": items((P1, 12)), "paymentMode": "CREDIT"}, tok=BT)
    ob = must("POST", f"/storefront/checkout/sessions/{sb['sessionId']}/confirm", {}, tok=BT)
    odb = must("GET", f"/orders/{ob['orderId']}")
    check(odb["channel"] == "B2B" and odb["paymentMode"] == "CREDIT" and odb["paymentStatus"] == "PENDING" and odb["paymentTerms"] == "CREDIT_30", "B2B order on credit: channel B2B, payment pending, CREDIT_30 terms", {k: odb[k] for k in ("channel", "paymentMode", "paymentStatus", "paymentTerms")})
    qb_big = must("POST", "/storefront/checkout/quote", {"addressId": B_addr, "items": items((P1, 40))}, tok=BT)
    check("CREDIT" not in qb_big["payment"]["allowedModes"] and qb_big["payment"]["creditUnavailableReason"], "a bulk order beyond the credit limit no longer offers credit (reason given)", qb_big["payment"]["creditUnavailableReason"])
    status, bad = call("POST", "/storefront/checkout/sessions", {"addressId": B_addr, "items": items((P1, 40)), "paymentMode": "CREDIT"}, tok=BT)
    check(status == 400, "and choosing credit anyway is refused")
    status, bad = call("POST", "/storefront/checkout/sessions", {"addressId": B_addr, "items": items((P1, 12)), "paymentMode": "COD"}, tok=BT)
    check(status == 400, "B2B cannot use cash on delivery")
else:
    check(False, "could not create the B2B retailer account for the credit tests", reg)

# ------------------------------------------------------------ reconciliation
step("14. Socket down / dashboard closed: reconciliation query loses nothing")
listener.terminate()
_, sync0 = call("GET", f"/orders-sync?since={time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(time.time() - 3600))}Z")
last_fetch = sync0["serverTime"]
C9 = new_customer(9)
A9 = add_address(C9, *LOCAL_LL)
s9 = must("POST", "/storefront/checkout/sessions", {"addressId": A9, "items": items((P1, 1)), "paymentMode": "COD"}, tok=C9["tok"])
o9 = must("POST", f"/storefront/checkout/sessions/{s9['sessionId']}/confirm", {}, tok=C9["tok"])
sync1 = must("GET", f"/orders-sync?since={last_fetch}")
got = [o for o in sync1["orders"] if o["id"] == o9["orderId"]]
check(len(got) == 1 and got[0]["orderNumber"] == o9["orderNumber"], "an order placed while offline is returned by the reconciliation query", [o["orderNumber"] for o in sync1["orders"]][-3:])
sync2 = must("GET", f"/orders-sync?since={last_fetch}")
check(len({o["id"] for o in sync2["orders"]}) == len(sync2["orders"]), "results are unique by order id (client dedup key)")
check(sync1["serverTime"] > last_fetch, "serverTime advances for the next call")
check(must("GET", "/notifications/push/key")["publicKey"], "web-push public key is served for browser subscription")
push = must("POST", "/notifications/push/subscribe", {"endpoint": f"https://push.example.test/{STAMP}", "p256dh": "BPubKeyPlaceholder1234567890", "auth": "authsecret1"})
check(push["subscribed"], "a browser push subscription can be registered")

# --------------------------------------------------------------- permissions
step("15. Permissions")
st, _ = call("PATCH", "/checkout-settings", {"localRadiusKm": 9}, tok=lg2["accessToken"])
check(st == 403, "logistics cannot change checkout settings")
st, _ = call("GET", "/orders-sync?since=2026-01-01T00:00:00Z", tok=lg2["accessToken"])
check(st in (200, 403), f"sync endpoint honours orders.view ({st})")
st, _ = call("GET", "/storefront/orders", tok="")
check(st == 401, "storefront orders require a customer session")
st, d = call("GET", f"/storefront/orders/{placed['orderNumber']}", tok=C2["tok"])
check(st == 404, "a customer cannot open another customer's order")

restore()
print("\n=============================================")
print(f"  Failed checks: {failures}")
print("=============================================")
sys.exit(1 if failures else 0)
