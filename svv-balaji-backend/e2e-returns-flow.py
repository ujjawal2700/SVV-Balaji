#!/usr/bin/env python3
"""
End-to-end check of order-item Returns & Exchanges against a RUNNING API
(mock OTP, PAYMENT_GATEWAY=mock, SHIPPING_PROVIDER=mock, SHIPROCKET_WEBHOOK_TOKEN set).

  A  Quick (rider) RETURN: eligibility -> media rule -> duplicate / concurrent requests ->
     approve -> rider pickup with the customer's code -> hand-in -> QC (good + damaged stock,
     batch traceability) -> refund to the rupee Refund Wallet -> wallet spent at checkout ->
     order cancelled gives it back
  B  Quick EXCHANGE to a dearer product: atomic replacement reservation under a race ->
     price difference (wallet + online) -> rider replacement delivery with the customer's code
  C  Shiprocket RETURN: reverse AWB, courier status kept separately, deductions on a
     change-of-mind return, manual UPI refund needs a reference; failed pickup -> rebook -> cancel
  D  Shiprocket EXCHANGE: replacement RTO -> back in stock -> converted to a refund
  E  B2B retailer: separate queue, credit-note refund reduces what is owed
  F  QC reject, not-delivered and cancelled orders refused

Stock is made through the real chain (farmer -> raw batch -> production -> QA release),
so returned packs are proven to trace back to the farmer.

  BASE_URL=http://localhost:3100/api/v1 SEED_SUPER_ADMIN_PASSWORD=... python e2e-returns-flow.py
"""
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import date

BASE = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
EMAIL = os.environ.get("SEED_SUPER_ADMIN_EMAIL", "admin@svvbalaji.com")
PASSWORD = os.environ.get("SEED_SUPER_ADMIN_PASSWORD", "admin@123")
WEBHOOK_TOKEN = os.environ.get("SHIPROCKET_WEBHOOK_TOKEN", "e2e-webhook-token")
STAMP = str(int(time.time()))
TODAY = date.today().isoformat()
failures = 0
token = ""
pay_n = [0]


def call(method, path, body=None, tok=None, auth=True, headers=None):
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
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw


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
            print(f"       {json.dumps(detail, default=str)[:700]}")


def must(method, path, body=None, expect=(200, 201), tok=None, auth=True):
    s, d = call(method, path, body, tok=tok, auth=auth)
    if s not in expect:
        print(f"  !! {method} {path} -> {s}: {json.dumps(d, default=str)[:700]}")
        raise SystemExit(1)
    return d


def rows(d):
    return d.get("data", d.get("rows", d)) if isinstance(d, dict) else d


def msg(d):
    if isinstance(d, dict):
        m = d.get("message")
        return " ".join(m) if isinstance(m, list) else str(m)
    return str(d)


def pay():
    pay_n[0] += 1
    return {"gatewayPaymentId": f"mockpay_{STAMP}_{pay_n[0]}", "signature": "mock_signature"}


def webhook(awb, status, ts=None):
    return call("POST", "/webhooks/shiprocket", {"awb": awb, "current_status": status, "current_timestamp": ts or f"{time.time()}"}, auth=False,
                headers={"x-api-key": WEBHOOK_TOKEN})


def wait_for(fn, timeout=12):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(0.4)
    return None


# ------------------------------------------------------------------------- setup
step("0. Login, nodes, stock through the real chain")
_, lg = call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD}, auth=False)
token = lg["accessToken"]
BR = rows(must("GET", "/branches"))[0]["id"]
WH_C = must("POST", "/warehouses", {"name": f"Returns Depot {STAMP}", "location": "Bhopal", "branchId": BR, "capacity": 99999, "kind": "CENTRAL", "city": "Bhopal", "state": "Madhya Pradesh"})["id"]
OUTLET_LL = (23.2599, 77.4126)
WH_O = must("POST", "/warehouses", {"name": f"Returns Outlet {STAMP}", "location": "Arera Colony", "branchId": BR, "capacity": 5000, "kind": "OUTLET",
                                    "city": "Bhopal", "state": "Madhya Pradesh", "latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1], "serviceRadiusKm": 5})["id"]
must("PATCH", "/checkout-settings", {"centralWarehouseId": WH_C, "localRadiusKm": 5, "codEnabled": True, "codMaxAmount": 50000, "reservationTtlMinutes": 15})
farmer = must("POST", "/farmers", {
    "fullName": f"Returns Farmer {STAMP}", "mobile": f"97{STAMP[-8:]}", "village": "Ashta", "district": "Sehore", "state": "Madhya Pradesh",
    "farmSizeAcres": 5, "cropDetails": "Wheat", "branchId": BR, "aadhaarNumber": f"{STAMP}34"[:12], "address": "Ashta",
    "landType": "Irrigated", "irrigationType": "Canal", "bankAccountName": "F", "bankName": "SBI", "bankAccountNo": f"{STAMP}01", "ifscCode": "SBIN0001234",
})
must("PATCH", f"/farmers/{farmer['id']}/verify", {"action": "APPROVED"})


def make_product(label, b2c, b2b):
    p = must("POST", "/products", {"name": f"{label} {STAMP}", "sku": f"{label.replace(' ', '-').upper()}-{STAMP}", "unit": "PACK", "showOnStorefront": True})
    must("POST", "/price-lists", {"productId": p["id"], "channel": "B2C", "customerType": "CONSUMER", "unitPrice": b2c, "gstRatePercent": 5, "effectiveFrom": TODAY})
    must("POST", "/price-lists", {"productId": p["id"], "channel": "B2B", "customerType": "RETAILER", "unitPrice": b2b, "gstRatePercent": 5, "effectiveFrom": TODAY})
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


ATTA = make_product("Ret Atta", 100, 80)
GHEE = make_product("Ret Ghee", 150, 120)       # dearer: exchange target
FG_ATTA_O = make_fg(ATTA, 40, WH_O)
FG_ATTA_C = make_fg(ATTA, 60, WH_C)
FG_GHEE_O = make_fg(GHEE, 2, WH_O)              # exactly two replacement units at the outlet
FG_GHEE_C = make_fg(GHEE, 10, WH_C)


def stock_row(wh, fg):
    for r in rows(must("GET", f"/finished-goods-stock?warehouseId={wh}")):
        if r.get("fgBatchId") == fg["id"] or (r.get("fgBatch") or {}).get("fgBatchNumber") == fg["fgBatchNumber"]:
            return r
    return {"quantity": 0, "reservedQuantity": 0, "damagedQuantity": 0}


check(stock_row(WH_O, FG_ATTA_O)["quantity"] == 40, "outlet stocked through farmer -> production -> QA release")

# Policy: customers pay return shipping + 10% restocking on change-of-mind; any product may be an exchange.
must("PATCH", "/return-settings/B2C", {"returnEnabled": True, "exchangeEnabled": True, "returnWindowHours": 168, "exchangeWindowHours": 168, "mediaRequired": False,
                                       "qcRequired": True, "autoApprove": False, "returnShippingPayer": "CUSTOMER", "returnShippingFee": 20, "restockingFeePercent": 10,
                                       "exchangeSameProductOnly": False, "exchangeSameCategoryOnly": False, "exchangeLowerPriceAction": "REFUND_TO_WALLET",
                                       "restockOnQcPass": True, "allowedRefundMethods": ["WALLET", "UPI", "BANK"], "defaultRefundMethod": "WALLET",
                                       "nonReturnableProductIds": [], "nonExchangeableProductIds": []})
s, bad = call("PATCH", "/return-settings/B2C", {"allowedRefundMethods": ["CREDIT_NOTE"], "defaultRefundMethod": "CREDIT_NOTE"})
check(s == 400, "credit notes cannot be offered to B2C customers", msg(bad))
REASONS = {r["code"]: r for r in must("GET", "/return-settings/reasons")}
check({"DAMAGED", "CHANGED_MIND", "DIFFERENT_PACK"} <= set(REASONS), "default reasons seeded", sorted(REASONS))

# Rider at the outlet
rphone = f"7{STAMP[-6:]}501"
r = must("POST", "/rider/auth/signup", {"fullName": "Return Rider", "phone": rphone, "password": "Secret#123", "vehicleType": "MOTORCYCLE", "vehicleNumber": "mp04 rt 1"}, auth=False)
rs = must("POST", "/rider/auth/verify", {"phone": rphone, "code": r["devCode"]}, auth=False)
RIDER = {"id": rs["rider"]["id"], "tok": rs["accessToken"]}
must("POST", f"/riders/{RIDER['id']}/approve", {"warehouseId": WH_O})
must("POST", "/rider/availability", {"online": True, "latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1]}, tok=RIDER["tok"])
check(True, "rider approved at the outlet and online")


def new_customer(tag):
    phone = f"9{STAMP[-6:]}{tag:03d}"
    call("POST", "/storefront/auth/otp/request", {"phone": phone}, auth=False)
    _, sess = call("POST", "/storefront/auth/otp/verify", {"phone": phone, "code": "123456", "audience": "CUSTOMER", "fullName": f"Returner {tag}"}, auth=False)
    tok = sess["accessToken"]
    me = must("GET", "/storefront/auth/me", tok=tok)
    return {"tok": tok, "id": me["customer"]["id"]}


def add_address(c, ll, city="Bhopal"):
    return must("POST", "/storefront/addresses", {"label": "Home", "fullName": "Test Returner", "phone": "9876543210", "line1": "12 Test Street", "city": city,
                                                  "state": "Madhya Pradesh", "pincode": "462016", "latitude": ll[0], "longitude": ll[1]}, tok=c["tok"])["id"]


def place(c, addr, lines, mode="ONLINE", extra=None):
    body = {"addressId": addr, "items": [{"productId": p["id"], "quantity": q} for p, q in lines], "paymentMode": mode}
    body.update(extra or {})
    sess = must("POST", "/storefront/checkout/sessions", body, tok=c["tok"])
    conf = pay() if sess["payment"]["requiresPayment"] else {}
    placed = must("POST", f"/storefront/checkout/sessions/{sess['sessionId']}/confirm", conf, tok=c["tok"])
    return {"id": placed["orderId"], "number": placed["orderNumber"], "session": sess}


def deliver_local(o, c):
    """Pack, then the outlet's rider delivers it through the rider app (the real Quick flow)."""
    plan = must("POST", f"/orders/{o['id']}/start-packing", {})
    for p in plan["plan"]:
        must("POST", f"/orders/{o['id']}/scan", {"code": p["fgBatchNumber"]})
    of = accept_offer("ORDER_DELIVERY")
    tid = of["taskId"]
    for a in ("arrived-pickup", "picked-up", "start", "arrived"):
        must("POST", f"/rider/tasks/{tid}/{a}", {}, tok=RIDER["tok"])
    otp = must("GET", f"/storefront/orders/{o['number']}", tok=c["tok"])["deliveryOtp"]
    must("POST", f"/rider/tasks/{tid}/deliver", {"otp": otp}, tok=RIDER["tok"])


def deliver_courier(o):
    plan = must("POST", f"/orders/{o['id']}/start-packing", {})
    for p in plan["plan"]:
        must("POST", f"/orders/{o['id']}/scan", {"code": p["fgBatchNumber"]})
    sh = must("POST", f"/orders/{o['id']}/ship", {})
    webhook(sh["awb"], "DELIVERED")
    return sh


def item_of(o, product):
    od = must("GET", f"/orders/{o['id']}")
    return next(i for i in od["items"] if i["productId"] == product["id"])


def accept_offer(task_kind):
    def find():
        for of in must("GET", "/rider/offers", tok=RIDER["tok"]):
            if of.get("kind") == task_kind:
                return of
        return None
    of = wait_for(find)
    if not of:
        return None
    must("POST", f"/rider/offers/{of['offerId']}/accept", tok=RIDER["tok"])
    return of


LOCAL_LL = (23.2750, 77.4250)
FAR_LL = (22.7196, 75.8577)

# ===================================================================== A. Quick return
step("A1. Quick RETURN: eligibility at item level, from the actual delivery")
C1 = new_customer(1)
A1 = add_address(C1, LOCAL_LL)
O1 = place(C1, A1, [(ATTA, 6)])
s, bad = call("POST", "/storefront/returns", {"orderNumber": O1["number"], "orderItemId": item_of(O1, ATTA)["id"], "type": "RETURN", "quantity": 1, "reasonId": REASONS["CHANGED_MIND"]["id"]}, tok=C1["tok"])
check(s == 400 and bad.get("code") == "ORDER_NOT_ELIGIBLE", "a not-yet-delivered order cannot be returned", bad)
deliver_local(O1, C1)
IT1 = item_of(O1, ATTA)
el = must("GET", f"/storefront/returns/orders/{O1['number']}/eligibility", tok=C1["tok"])
e_item = el["items"][0]
check(el["logistics"] == "QUICK_DELIVERY" and e_item["return"]["eligible"] and e_item["exchange"]["eligible"] and e_item["remainingQuantity"] == 6,
      "delivered LOCAL order: QUICK_DELIVERY path, 6 units returnable/exchangeable, window from deliveredAt", e_item)
check(e_item["return"]["closesAt"] and el["deliveredAt"], "the window closing time is reported")

step("A2. Media rule, duplicate and concurrent requests")
base = {"orderNumber": O1["number"], "orderItemId": IT1["id"], "type": "RETURN"}
s, bad = call("POST", "/storefront/returns", {**base, "quantity": 2, "reasonId": REASONS["DAMAGED"]["id"]}, tok=C1["tok"])
check(s == 400 and bad.get("code") == "MEDIA_REQUIRED", "'arrived damaged' needs a photo", bad)
s, bad = call("POST", "/storefront/returns", {**base, "quantity": 7, "reasonId": REASONS["CHANGED_MIND"]["id"]}, tok=C1["tok"])
check(s == 400, "cannot return more than was ordered")
results = []


def race_req():
    results.append(call("POST", "/storefront/returns", {**base, "quantity": 4, "reasonId": REASONS["CHANGED_MIND"]["id"]}, tok=C1["tok"]))


ts = [threading.Thread(target=race_req) for _ in range(2)]
[t.start() for t in ts]
[t.join() for t in ts]
ok = [d for s_, d in results if s_ in (200, 201)]
dup = [d for s_, d in results if s_ == 409]
check(len(ok) == 1 and len(dup) == 1 and dup[0].get("code") in ("QUANTITY_EXCEEDED", "DUPLICATE_REQUEST"),
      "two simultaneous requests for 4 of 6: exactly one wins, the other is refused", [s_ for s_, _ in results])
RACE = ok[0]["requestNumber"] if ok else None
c = must("POST", f"/storefront/returns/{RACE}/cancel", {"note": "changed my mind"}, tok=C1["tok"])
check(c["status"] == "CANCELLED", "customer cancels before pickup -> quantity is free again")

key = f"ret-{STAMP}-a"
RA = must("POST", "/storefront/returns", {**base, "quantity": 2, "reasonId": REASONS["DAMAGED"]["id"], "description": "Seal torn", "mediaUrls": ["https://example.test/photo1.jpg"]},
          tok=C1["tok"])
s2, again = call("POST", "/storefront/returns", {**base, "quantity": 2, "reasonId": REASONS["DAMAGED"]["id"], "mediaUrls": ["https://example.test/photo1.jpg"]}, tok=C1["tok"],
                 headers={"Idempotency-Key": key})
s3, again2 = call("POST", "/storefront/returns", {**base, "quantity": 2, "reasonId": REASONS["DAMAGED"]["id"], "mediaUrls": ["https://example.test/photo1.jpg"]}, tok=C1["tok"],
                  headers={"Idempotency-Key": key})
check(s2 in (200, 201) and s3 in (200, 201) and again["requestNumber"] == again2["requestNumber"], "same Idempotency-Key -> the same request, not a second one", [again.get("requestNumber"), again2.get("requestNumber")])
must("POST", f"/storefront/returns/{again['requestNumber']}/cancel", {}, tok=C1["tok"])
check(RA["status"] == "REQUESTED" and RA["refundAmount"] == RA["itemValue"] and RA["deductions"]["shippingFee"] == 0,
      "damaged (company fault): full paid value refundable, no shipping/restocking deduction", {k: RA[k] for k in ("status", "refundAmount", "itemValue", "deductions")})

step("A3. Separate staff queues; approve books a rider pickup")
RA_ID = next(x["id"] for x in must("GET", f"/returns/customers?search={RA['requestNumber']}")["rows"])
s, _ = call("GET", f"/returns/retailers/{RA_ID}")
check(s == 404, "a customer request is invisible in the retailer queue")
ap = must("POST", f"/returns/customers/{RA_ID}/approve", {"note": "photos show a torn seal"})
check(ap["status"] == "PICKUP_SCHEDULED" and any(t["kind"] == "RETURN_PICKUP" for t in ap["riderTasks"]), "approved -> PICKUP_SCHEDULED with a RETURN_PICKUP rider task", ap.get("status"))
cv = must("GET", f"/storefront/returns/{RA['requestNumber']}", tok=C1["tok"])
PICKUP_OTP = cv["pickupOtp"]
check(PICKUP_OTP and len(PICKUP_OTP) == 4, "the customer (only) sees a pickup code to read to the rider")

step("A4. Rider: accept -> start -> arrive -> collect with the code -> hand in at the store")
of = accept_offer("RETURN_PICKUP")
check(of is not None, "the pickup was offered to the outlet's rider", of)
TID = of["taskId"]
td = must("GET", f"/rider/tasks/{TID}", tok=RIDER["tok"])
check(td["kind"] == "RETURN_PICKUP" and td["returnRequest"]["requestNumber"] == RA["requestNumber"] and td["items"][0]["quantity"] == 2 and td["otpLength"] == 4,
      "rider sees what to collect and the code length (never the code)", {k: td.get(k) for k in ("kind", "returnRequest", "items", "otpLength")})
s, bad = call("POST", f"/rider/tasks/{TID}/picked-up", {}, tok=RIDER["tok"])
check(s == 409 and bad.get("code") == "USE_RETURN_TASK_ACTIONS", "order-delivery actions are refused on a return trip", bad)
must("POST", f"/rider/return-tasks/{TID}/start", {}, tok=RIDER["tok"])
must("POST", f"/rider/return-tasks/{TID}/arrived", {"latitude": LOCAL_LL[0], "longitude": LOCAL_LL[1]}, tok=RIDER["tok"])
wrong = str((int(PICKUP_OTP) + 1) % 10000).zfill(4)
s, bad = call("POST", f"/rider/return-tasks/{TID}/collect", {"otp": wrong}, tok=RIDER["tok"])
check(s == 400 and bad.get("attemptsLeft") == 4, "wrong pickup code refused (4 attempts left)", bad)
must("POST", f"/rider/return-tasks/{TID}/collect", {"otp": PICKUP_OTP}, tok=RIDER["tok"])
check(must("GET", f"/returns/customers/{RA_ID}")["status"] == "PICKED_UP", "request PICKED_UP")
before = stock_row(WH_O, FG_ATTA_O)
must("POST", f"/rider/return-tasks/{TID}/hand-in", {"latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1]}, tok=RIDER["tok"])
d = must("GET", f"/returns/customers/{RA_ID}")
check(d["status"] == "QC" and d["stamps"]["receivedAt"], "handed in -> QC pending (received)", d["status"])

step("A5. QC: 1 good back to stock, 1 damaged to the damaged bucket; batch traceability kept")
s, bad = call("POST", f"/returns/customers/{RA_ID}/qc", {"decision": "ACCEPT", "goodQuantity": 2, "damagedQuantity": 1})
check(s == 400, "good + damaged must equal the returned quantity")
d = must("POST", f"/returns/customers/{RA_ID}/qc", {"decision": "ACCEPT", "goodQuantity": 1, "damagedQuantity": 1, "notes": "one pouch torn"})
after = stock_row(WH_O, FG_ATTA_O)
check(d["status"] == "REFUND_INITIATED", "QC accepted -> REFUND_INITIATED")
check(after["quantity"] == before["quantity"] + 1 and after.get("damagedQuantity", 0) == before.get("damagedQuantity", 0) + 1,
      "stock: +1 sellable, +1 damaged on the SAME batch the order shipped", {"before": before, "after": after})
check(sorted((x["disposition"], x["fgBatchNumber"]) for x in d["stock"]) == [("DAMAGED", FG_ATTA_O["fgBatchNumber"]), ("GOOD", FG_ATTA_O["fgBatchNumber"])],
      "return batch lines name the FG batch", d["stock"])
mv = rows(must("GET", f"/warehouses/movements?warehouseId={WH_O}"))
check(any(m.get("movementType") == "RETURN_INWARD" for m in mv) and any(m.get("movementType") == "RETURN_DAMAGED" for m in mv),
      "both moves are on the stock ledger (RETURN_INWARD / RETURN_DAMAGED)")
tr = must("GET", f"/trace/{FG_ATTA_O['fgBatchNumber']}")
check(farmer["id"] in json.dumps(tr) or farmer["fullName"] in json.dumps(tr), "the returned pack's batch still resolves to the farmer", str(tr)[:300])

step("A6. Refund to the rupee Refund Wallet; then spend it at checkout; cancel gives it back")
d = must("POST", f"/returns/customers/{RA_ID}/refund", {"refundMethod": "WALLET"})
check(d["status"] == "COMPLETED" and d["refund"]["method"] == "WALLET", "refund completed to the wallet")
s, bad = call("POST", f"/returns/customers/{RA_ID}/refund", {"refundMethod": "WALLET"})
check(s == 409, "a refund can never be paid twice")
w = must("GET", "/storefront/wallet/refund", tok=C1["tok"])
check(abs(w["balance"] - RA["refundAmount"]) < 0.01 and w["transactions"][0]["reason"] == "RETURN_REFUND", "wallet balance = refund, with a ledger row", w)
el = must("GET", f"/storefront/returns/orders/{O1['number']}/eligibility", tok=C1["tok"])
check(el["items"][0]["remainingQuantity"] == 4, "partial return: 4 of 6 still eligible", el["items"][0]["remainingQuantity"])
q = must("POST", "/storefront/checkout/quote", {"addressId": A1, "items": [{"productId": ATTA["id"], "quantity": 3}], "paymentMode": "COD", "useRefundWallet": True}, tok=C1["tok"])
check(abs(q["totals"]["refundWalletApplied"] - w["balance"]) < 0.01 and abs(q["totals"]["amountDue"] - (q["totals"]["totalPayable"] - w["balance"])) < 0.01,
      "quote applies the wallet as a payment: invoice total unchanged, less due in cash", q["totals"])
s, bad = call("POST", "/storefront/checkout/quote", {"addressId": A1, "items": [{"productId": ATTA["id"], "quantity": 3}], "paymentMode": "CREDIT", "useRefundWallet": True}, tok=C1["tok"])
check(s == 400, "wallet + credit terms is refused")
OW = place(C1, A1, [(ATTA, 3)], mode="COD", extra={"useRefundWallet": True})
odw = must("GET", f"/orders/{OW['id']}")
check(abs(float(odw["refundWalletPaidInr"]) - w["balance"]) < 0.01, "order records the wallet payment", odw.get("refundWalletPaidInr"))
check(must("GET", "/storefront/wallet/refund", tok=C1["tok"])["balance"] == 0, "wallet debited at placement")
must("PATCH", f"/orders/{OW['id']}/cancel", {"reason": "test cancel"})
w2 = must("GET", "/storefront/wallet/refund", tok=C1["tok"])
check(abs(w2["balance"] - w["balance"]) < 0.01 and w2["transactions"][0]["reason"] == "ORDER_PAYMENT_REVERSAL", "cancelled order -> wallet payment returned", w2["transactions"][:2])
s, bad = call("POST", "/storefront/returns", {"orderNumber": OW["number"], "orderItemId": item_of(OW, ATTA)["id"], "type": "RETURN", "quantity": 1,
                                             "reasonId": REASONS["CHANGED_MIND"]["id"]}, tok=C1["tok"])
check(s == 400 and "cancel" in msg(bad).lower(), "a cancelled order cannot be returned", msg(bad))

# ===================================================================== B. Quick exchange
step("B1. EXCHANGE to a dearer product; replacement stock reserved atomically under a race")
opts = must("GET", f"/storefront/returns/orders/{O1['number']}/items/{IT1['id']}/replacements", tok=C1["tok"])
ghee = next((o for o in opts if o["productId"] == GHEE["id"]), None)
check(ghee and ghee["available"] == 2 and ghee["unitPrice"] > 100, "replacement options carry live price and outlet availability", ghee)
exb = {"orderNumber": O1["number"], "orderItemId": IT1["id"], "type": "EXCHANGE", "quantity": 2, "reasonId": REASONS["DIFFERENT_PACK"]["id"], "replacementProductId": GHEE["id"]}
EX1 = must("POST", "/storefront/returns", exb, tok=C1["tok"])
check(EX1["exchange"]["priceDifference"] > 0 and EX1["exchange"]["differenceStatus"] == "PENDING", "dearer replacement: customer owes the difference", EX1["exchange"])
EX2 = must("POST", "/storefront/returns", {**exb}, tok=C1["tok"])  # the other 2 units, same 2 ghee
ids = [next(x["id"] for x in must("GET", f"/returns/customers?search={e['requestNumber']}")["rows"]) for e in (EX1, EX2)]
res = []


def approve(i):
    res.append(call("POST", f"/returns/customers/{i}/approve", {"schedulePickup": False}))


ts = [threading.Thread(target=approve, args=(i,)) for i in ids]
[t.start() for t in ts]
[t.join() for t in ts]
codes = sorted(s_ for s_, _ in res)
check(codes == [200, 409] and any(isinstance(d_, dict) and d_.get("code") == "REPLACEMENT_OUT_OF_STOCK" for _, d_ in res),
      "two exchanges approved at once for the last 2 units: one reserves, the other is out of stock", [(s_, d_.get("code") if isinstance(d_, dict) else d_) for s_, d_ in res])
win = next(d_["id"] for s_, d_ in res if s_ == 200)
lose = ids[1] if win == ids[0] else ids[0]
check(stock_row(WH_O, FG_GHEE_O)["reservedQuantity"] == 2, "the 2 outlet units are reserved for the winner")
d = must("POST", f"/returns/customers/{lose}/reject", {"reason": "Replacement out of stock - please raise a return"})
check(d["status"] == "REJECTED", "the loser is rejected (quantity freed)")
WIN_NO = must("GET", f"/returns/customers/{win}")["requestNumber"]

step("B2. Pickup, QC, pay the difference (wallet + online), then rider delivers the replacement")
must("POST", f"/returns/customers/{win}/schedule-pickup", {})
cv = must("GET", f"/storefront/returns/{WIN_NO}", tok=C1["tok"])
of = accept_offer("RETURN_PICKUP")
TID = of["taskId"]
for a in ("start", "arrived"):
    must("POST", f"/rider/return-tasks/{TID}/{a}", {}, tok=RIDER["tok"])
must("POST", f"/rider/return-tasks/{TID}/collect", {"otp": cv["pickupOtp"]}, tok=RIDER["tok"])
must("POST", f"/rider/return-tasks/{TID}/hand-in", {}, tok=RIDER["tok"])
d = must("POST", f"/returns/customers/{win}/qc", {"decision": "ACCEPT", "goodQuantity": 2, "damagedQuantity": 0})
check(d["status"] == "REPLACEMENT_PROCESSING", "QC passed -> REPLACEMENT_PROCESSING")
s, bad = call("POST", f"/returns/customers/{win}/dispatch-replacement", {})
check(s == 409 and bad.get("code") == "DIFFERENCE_UNPAID", "the replacement does not leave until the difference is paid", bad)
due = must("GET", f"/storefront/returns/{WIN_NO}", tok=C1["tok"])["exchange"]["amountDue"]
pd = must("POST", f"/storefront/returns/{WIN_NO}/pay-difference", {"useWallet": False}, tok=C1["tok"])
check(not pd["paid"] and pd["walletUsed"] == 0 and abs(pd["amountDue"] - due) < 0.01 and pd["gateway"], "paying online opens a gateway order for the server's amount", pd)
s, bad = call("POST", f"/storefront/returns/{WIN_NO}/pay-difference/confirm", {"gatewayPaymentId": "mockpay_forged", "signature": "nope"}, tok=C1["tok"])
check(s == 400, "a forged payment is refused")
must("POST", f"/storefront/returns/{WIN_NO}/pay-difference/confirm", pay(), tok=C1["tok"])
check(must("GET", f"/storefront/returns/{WIN_NO}", tok=C1["tok"])["exchange"]["differenceStatus"] == "PAID", "difference PAID")
ghee_before = stock_row(WH_O, FG_GHEE_O)
must("POST", f"/returns/customers/{win}/dispatch-replacement", {})
of = accept_offer("REPLACEMENT_DELIVERY")
check(of is not None and of["items"][0]["name"].startswith("Ret Ghee"), "replacement delivery offered (carrying the replacement product)", of)
TID = of["taskId"]
s, bad = call("POST", f"/rider/return-tasks/{TID}/start", {}, tok=RIDER["tok"])
check(s == 409, "cannot head out before collecting the replacement")
must("POST", f"/rider/return-tasks/{TID}/arrived-pickup", {}, tok=RIDER["tok"])
must("POST", f"/rider/return-tasks/{TID}/picked-up", {}, tok=RIDER["tok"])
gh = stock_row(WH_O, FG_GHEE_O)
check(gh["quantity"] == ghee_before["quantity"] - 2 and gh["reservedQuantity"] == ghee_before["reservedQuantity"] - 2, "stock out at pickup (quantity and reservation both down)", {"before": ghee_before, "after": gh})
cv = must("GET", f"/storefront/returns/{WIN_NO}", tok=C1["tok"])
check(cv["status"] == "SHIPPED" and cv["replacementOtp"], "customer sees SHIPPED and a delivery code")
must("POST", f"/rider/return-tasks/{TID}/start", {}, tok=RIDER["tok"])
must("POST", f"/rider/return-tasks/{TID}/arrived", {}, tok=RIDER["tok"])
must("POST", f"/rider/return-tasks/{TID}/deliver", {"otp": cv["replacementOtp"]}, tok=RIDER["tok"])
check(must("GET", f"/returns/customers/{win}")["status"] == "COMPLETED", "replacement delivered -> exchange COMPLETED")
el = must("GET", f"/storefront/returns/orders/{O1['number']}/eligibility", tok=C1["tok"])
check(el["items"][0]["remainingQuantity"] == 2 and el["items"][0]["return"]["eligible"], "6 ordered: 2 returned, 2 exchanged, 2 left", el["items"][0]["remainingQuantity"])

# ===================================================================== C. Shiprocket return
step("C1. Shiprocket RETURN: reverse AWB, courier status separate, deductions on change of mind")
C2 = new_customer(2)
A2 = add_address(C2, FAR_LL, city="Indore")
O2 = place(C2, A2, [(ATTA, 4)], mode="COD")
deliver_courier(O2)
IT2 = item_of(O2, ATTA)
RC = must("POST", "/storefront/returns", {"orderNumber": O2["number"], "orderItemId": IT2["id"], "type": "RETURN", "quantity": 1, "reasonId": REASONS["CHANGED_MIND"]["id"],
                                         "refundMethod": "UPI", "upiId": "returner@okbank"}, tok=C2["tok"])
check(RC["logistics"] == "SHIPROCKET" and RC["deductions"]["shippingFee"] == 20 and abs(RC["deductions"]["restockingFee"] - round(RC["itemValue"] * 0.10, 2)) < 0.011,
      "change of mind: Rs 20 return shipping + 10% restocking deducted", {k: RC[k] for k in ("logistics", "itemValue", "deductions", "refundAmount")})
RC_ID = must("GET", f"/returns/customers?search={RC['requestNumber']}")["rows"][0]["id"]
d = must("POST", f"/returns/customers/{RC_ID}/approve", {})
rev = next(x for x in d["shipments"] if x["direction"] == "REVERSE")
check(d["status"] == "PICKUP_SCHEDULED" and rev["awb"], "reverse pickup booked with an AWB", rev)
webhook(rev["awb"], "OUT FOR PICKUP")
d = must("GET", f"/returns/customers/{RC_ID}")
check(d["status"] == "PICKUP_SCHEDULED" and d["shipments"][0]["externalStatus"] == "OUT_FOR_PICKUP", "courier status stored separately; our status unchanged", (d["status"], d["shipments"][0]["externalStatus"]))
webhook(rev["awb"], "PICKED UP")
check(must("GET", f"/returns/customers/{RC_ID}")["status"] == "PICKED_UP", "courier PICKED UP -> PICKED_UP")
webhook(rev["awb"], "DELIVERED", ts="t-final")
webhook(rev["awb"], "DELIVERED", ts="t-final")
d = must("GET", f"/returns/customers/{RC_ID}")
check(d["status"] == "QC", "courier delivered to the warehouse -> received, QC pending (duplicate webhook harmless)", d["status"])
must("POST", f"/returns/customers/{RC_ID}/qc", {"decision": "ACCEPT", "goodQuantity": 1, "damagedQuantity": 0})
s, bad = call("POST", f"/returns/customers/{RC_ID}/refund", {"refundMethod": "UPI"})
check(s == 400 and "reference" in msg(bad).lower(), "a manual UPI refund needs its transaction reference", msg(bad))
d = must("POST", f"/returns/customers/{RC_ID}/refund", {"refundMethod": "UPI", "reference": "UPI-REF-123456"})
check(d["status"] == "COMPLETED" and d["refund"]["reference"] == "UPI-REF-123456" and d["refund"]["upiId"] == "returner@okbank", "UPI refund recorded with UPI id + reference (COD order)", d["refund"])

step("C2. Pickup failed -> rebook (new AWB) -> customer cancels before collection")
RC2 = must("POST", "/storefront/returns", {"orderNumber": O2["number"], "orderItemId": IT2["id"], "type": "RETURN", "quantity": 1, "reasonId": REASONS["CHANGED_MIND"]["id"]}, tok=C2["tok"])
RC2_ID = must("GET", f"/returns/customers?search={RC2['requestNumber']}")["rows"][0]["id"]
d = must("POST", f"/returns/customers/{RC2_ID}/approve", {})
awb1 = d["shipments"][0]["awb"]
webhook(awb1, "PICKUP EXCEPTION")
d = must("GET", f"/returns/customers/{RC2_ID}")
check(d["status"] == "PICKUP_FAILED", "courier pickup exception -> PICKUP_FAILED (customer unavailable)", d["status"])
d = must("POST", f"/returns/customers/{RC2_ID}/schedule-pickup", {})
active = [x for x in d["shipments"] if x["isActive"]]
check(d["status"] == "PICKUP_SCHEDULED" and len(active) == 1 and active[0]["awb"] != awb1, "rebooked with a new AWB; the old one is inactive")
c = must("POST", f"/storefront/returns/{RC2['requestNumber']}/cancel", {}, tok=C2["tok"])
check(c["status"] == "CANCELLED", "customer cancels before collection")

# ===================================================================== D. Shiprocket exchange
step("D. Shiprocket EXCHANGE (same product, no difference): RTO -> back in stock -> converted to refund")
EXD = must("POST", "/storefront/returns", {"orderNumber": O2["number"], "orderItemId": IT2["id"], "type": "EXCHANGE", "quantity": 1, "reasonId": REASONS["QUALITY_ISSUE"]["id"],
                                          "mediaUrls": ["https://example.test/q.jpg"]}, tok=C2["tok"])
check(EXD["exchange"]["priceDifference"] == 0 and EXD["exchange"]["differenceStatus"] == "NONE", "same-product exchange costs nothing")
EXD_ID = must("GET", f"/returns/customers?search={EXD['requestNumber']}")["rows"][0]["id"]
d = must("POST", f"/returns/customers/{EXD_ID}/approve", {})
awb = d["shipments"][0]["awb"]
webhook(awb, "PICKED UP"); webhook(awb, "DELIVERED")
must("POST", f"/returns/customers/{EXD_ID}/qc", {"decision": "ACCEPT", "goodQuantity": 1, "damagedQuantity": 0})
c_before = stock_row(WH_C, FG_ATTA_C)
d = must("POST", f"/returns/customers/{EXD_ID}/dispatch-replacement", {})
fwd = next(x for x in d["shipments"] if x["direction"] == "FORWARD")
check(d["status"] == "SHIPPED" and fwd["awb"], "replacement shipped by courier (forward AWB)")
webhook(fwd["awb"], "RTO INITIATED")
d = must("GET", f"/returns/customers/{EXD_ID}")
check(d["status"] == "DELIVERY_FAILED", "courier RTO -> DELIVERY_FAILED", d["status"])
d = must("POST", f"/returns/customers/{EXD_ID}/replacement-returned", {})
c_after = stock_row(WH_C, FG_ATTA_C)
check(d["status"] == "REPLACEMENT_PROCESSING" and c_after["quantity"] == c_before["quantity"] and c_after["reservedQuantity"] == c_before["reservedQuantity"],
      "undelivered replacement back in stock and still reserved", {"before": c_before, "after": c_after})
d = must("POST", f"/returns/customers/{EXD_ID}/convert-to-refund", {"reason": "Customer prefers a refund"})
check(d["status"] == "REFUND_INITIATED" and d["money"]["refundAmount"] == EXD["itemValue"], "converted: full paid value to refund, reservation released", d["money"])
check(stock_row(WH_C, FG_ATTA_C)["reservedQuantity"] == c_before["reservedQuantity"] - 1, "replacement reservation released")
d = must("POST", f"/returns/customers/{EXD_ID}/refund", {"refundMethod": "WALLET"})
check(d["status"] == "COMPLETED", "refunded to wallet")

# ===================================================================== E. B2B retailer
step("E. Retailer: separate queue, credit order refunded by credit note")
rph = f"8{STAMP[-6:]}777"
gstin = f"23ABCDE{STAMP[-4:]}F1Z5"
call("POST", "/storefront/auth/otp/request", {"phone": rph}, auth=False)
s, reg = call("POST", "/storefront/auth/register-retailer", {"phone": rph, "code": "123456", "fullName": "Retail Owner", "businessName": f"Ret Traders {STAMP}",
                                                             "gstin": gstin, "addressLine": "Market Rd", "city": "Bhopal", "state": "Madhya Pradesh", "pincode": "462001"}, auth=False)
pend = [a for a in rows(must("GET", f"/storefront/accounts?channel=B2B&search={rph}")) if str(a.get("phone", "")).endswith(rph[-10:])] if s in (200, 201) else []
if pend:
    must("PATCH", f"/storefront/accounts/{pend[0]['id']}/approve")
    call("POST", "/storefront/auth/otp/request", {"phone": rph}, auth=False)
    _, bs = call("POST", "/storefront/auth/otp/verify", {"phone": rph, "code": "123456", "audience": "RETAILER"}, auth=False)
    RT = {"tok": bs["accessToken"]}
    RT["id"] = must("GET", "/storefront/auth/me", tok=RT["tok"])["customer"]["id"]
    must("PATCH", f"/customers/{RT['id']}", {"paymentTerms": "CREDIT_30", "creditLimit": 100000})
    must("PATCH", "/return-settings/B2B", {"returnEnabled": True, "qcRequired": False})
    RA_B = add_address(RT, FAR_LL, city="Indore")  # far: courier path (local retailers route LOCAL, see e2e-retailer-routing-flow.py)
    OB = place(RT, RA_B, [(ATTA, 12)], mode="CREDIT")
    deliver_courier(OB)
    ITB = item_of(OB, ATTA)
    el = must("GET", f"/storefront/returns/orders/{OB['number']}/eligibility", tok=RT["tok"])
    check(el["policy"]["refundMethods"] == ["CREDIT_NOTE"], "unpaid credit bill: refunds settle by credit note only", el["policy"]["refundMethods"])
    RB = must("POST", "/storefront/returns", {"orderNumber": OB["number"], "orderItemId": ITB["id"], "type": "RETURN", "quantity": 2, "reasonId": REASONS["WRONG_ITEM"]["id"],
                                             "mediaUrls": ["https://example.test/w.jpg"]}, tok=RT["tok"])
    s, _ = call("GET", f"/returns/customers?search={RB['requestNumber']}")
    check(s == 200 and not must("GET", f"/returns/customers?search={RB['requestNumber']}")["rows"], "retailer request not in the customer queue")
    RB_ID = must("GET", f"/returns/retailers?search={RB['requestNumber']}")["rows"][0]["id"]
    d = must("POST", f"/returns/retailers/{RB_ID}/approve", {})
    webhook(d["shipments"][0]["awb"], "PICKED UP"); webhook(d["shipments"][0]["awb"], "DELIVERED")
    d = must("GET", f"/returns/retailers/{RB_ID}")
    check(d["status"] == "REFUND_INITIATED" and d["qc"]["decision"] == "ACCEPT", "QC switched off for retailers: receipt = passed inspection", (d["status"], d["qc"]))
    paid_before = float(must("GET", f"/orders/{OB['id']}")["amountPaid"])
    d = must("POST", f"/returns/retailers/{RB_ID}/refund", {})
    ob = must("GET", f"/orders/{OB['id']}")
    check(d["status"] == "COMPLETED" and abs(float(ob["amountPaid"]) - paid_before - RB["refundAmount"]) < 0.01,
          "credit note applied to the bill through Receivables (owed amount down by the refund)", {"amountPaid": ob["amountPaid"], "refund": RB["refundAmount"]})
else:
    check(False, "could not create the retailer account", reg)

# ===================================================================== F. QC reject
step("F. QC reject: claim refused, no refund, goods recorded as damaged")
C3 = new_customer(3)
A3 = add_address(C3, LOCAL_LL)
O3 = place(C3, A3, [(ATTA, 1)])
deliver_local(O3, C3)
RF = must("POST", "/storefront/returns", {"orderNumber": O3["number"], "orderItemId": item_of(O3, ATTA)["id"], "type": "RETURN", "quantity": 1, "reasonId": REASONS["CHANGED_MIND"]["id"]}, tok=C3["tok"])
RF_ID = must("GET", f"/returns/customers?search={RF['requestNumber']}")["rows"][0]["id"]
must("POST", f"/returns/customers/{RF_ID}/approve", {"schedulePickup": False})
must("POST", f"/returns/customers/{RF_ID}/receive", {"note": "customer dropped it at the counter"})
d = must("POST", f"/returns/customers/{RF_ID}/qc", {"decision": "REJECT", "goodQuantity": 0, "damagedQuantity": 1, "notes": "used product"})
check(d["status"] == "QC_FAILED" and d["stock"][0]["disposition"] == "DAMAGED" and not d["walletTransactions"], "QC_FAILED: nothing refunded, pack to damaged", d["status"])
check(must("GET", "/storefront/wallet/refund", tok=C3["tok"])["balance"] == 0, "customer wallet untouched")
el = must("GET", f"/storefront/returns/orders/{O3['number']}/eligibility", tok=C3["tok"])
check(not el["items"][0]["return"]["eligible"], "the item cannot be returned again", el["items"][0]["return"])
s, bad = call("POST", f"/returns/customers/{RF_ID}/refund", {})
check(s == 409, "no refund on a failed QC")

print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILURE(S)'}")
sys.exit(1 if failures else 0)
