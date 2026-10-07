#!/usr/bin/env python3
"""
End-to-end check of the admin order process fixes (7 Oct) against a RUNNING API
(mock OTP, PAYMENT_GATEWAY=mock). Run it against a throwaway database - it
changes delivery settings and leaves test riders/orders behind.

  A  GET /orders/:id carries the live delivery (offers with server-measured
     seconds left) so the admin screen can show who it is offered to
  B  offer timing: an accept that lands just after the deadline (network lag)
     still wins; one that is really late gets 409 OFFER_EXPIRED - never a 200
     the rider app could read as "assigned"
  C  staff assigning a registered rider keeps the order PACKED until the rider
     picks it up (as a broadcast accept does); pickup -> DISPATCHED -> OTP
  D  status override: forward (runs allocation / stock out / invoice / loyalty,
     skips the scan, rider and OTP), backward before dispatch (re-pack /
     re-allocate, riders released), refused after dispatch, reason required,
     permission required; the delivered pack still traces back to the farmer
  E  override to DISPATCHED keeps a rider who already has it; to CANCELLED
     closes the delivery

  SEED_SUPER_ADMIN_PASSWORD=... BASE_URL=http://localhost:3110/api/v1 python e2e-order-override-flow.py
"""
import json
import os
import time
import urllib.error
import urllib.request
from datetime import date

BASE = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
EMAIL = os.environ.get("SEED_SUPER_ADMIN_EMAIL", "admin@svvbalaji.com")
PASSWORD = os.environ.get("SEED_SUPER_ADMIN_PASSWORD", "admin@123")
STAMP = str(int(time.time()))
TODAY = date.today().isoformat()
failures = 0
token = ""


def call(method, path, body=None, tok=None, auth=True):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    t = tok or (token if auth else None)
    if t and t != "-":
        req.add_header("Authorization", f"Bearer {t}")
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
    s, d = call(method, path, body, tok)
    if s not in expect:
        print(f"  FATAL {method} {path} -> {s}: {json.dumps(d)[:600]}")
        raise SystemExit(2)
    return d


def rows(d):
    return d["data"] if isinstance(d, dict) and "data" in d else d


def wait_for(fn, timeout=25, every=0.5):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(every)
    return None


def clear_verification(rtok):
    for d in must("GET", "/rider/verification", tok=rtok)["documents"]:
        if not d["mandatory"] or d["satisfied"]:
            continue
        body = {"typeId": d["type"]["id"], "fileUrls": ["https://example.com/doc.jpg"], "documentNumber": "DOC123",
                "issuedBy": "Test Police Station", "issuedOn": "2026-01-01", "expiresOn": "2030-12-31"}
        doc = must("POST", "/rider/verification/documents", body, tok=rtok)
        must("POST", f"/riders/documents/{doc['id']}/approve", {})


token = must("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD}, tok="-")["accessToken"]
BR = rows(must("GET", "/branches"))[0]["id"]
OUTLET_LL = (23.2599, 77.4126)
IN_LL = (23.2750, 77.4250)
LOC_OUT = {"latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1]}
LOC_DROP = {"latitude": IN_LL[0], "longitude": IN_LL[1]}
SQUARE = [[OUTLET_LL[0] - 0.03, OUTLET_LL[1] - 0.03], [OUTLET_LL[0] - 0.03, OUTLET_LL[1] + 0.03],
          [OUTLET_LL[0] + 0.03, OUTLET_LL[1] + 0.03], [OUTLET_LL[0] + 0.03, OUTLET_LL[1] - 0.03]]

step("0. Outlet with traceable stock, Quick zone, two riders")
WH_C = must("POST", "/warehouses", {"name": f"OV Depot {STAMP}", "location": "Bhopal", "branchId": BR, "capacity": 99999, "kind": "CENTRAL", "city": "Bhopal", "state": "Madhya Pradesh"})["id"]
WH_O = must("POST", "/warehouses", {"name": f"OV Outlet {STAMP}", "location": "Arera Colony, Bhopal", "branchId": BR, "capacity": 5000, "kind": "OUTLET",
                                    "city": "Bhopal", "state": "Madhya Pradesh", "latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1], "serviceRadiusKm": 5})["id"]
must("PATCH", "/checkout-settings", {"centralWarehouseId": WH_C, "localRadiusKm": 5, "codEnabled": True, "codMaxAmount": 50000, "reservationTtlMinutes": 15})
farmer = must("POST", "/farmers", {
    "fullName": f"OV Farmer {STAMP}", "mobile": f"94{STAMP[-8:]}", "village": "Ashta", "district": "Sehore", "state": "Madhya Pradesh",
    "farmSizeAcres": 5, "cropDetails": "Wheat", "branchId": BR, "aadhaarNumber": f"{STAMP}66"[:12], "address": "Ashta",
    "landType": "Irrigated", "irrigationType": "Canal", "bankAccountName": "F", "bankName": "SBI", "bankAccountNo": f"{STAMP}04", "ifscCode": "SBIN0001234",
})
must("PATCH", f"/farmers/{farmer['id']}/verify", {"action": "APPROVED"})
P = must("POST", "/products", {"name": f"Override Atta {STAMP}", "sku": f"OV-ATTA-{STAMP}", "unit": "PACK", "showOnStorefront": True, "packWeightKg": 0.25})
must("POST", "/price-lists", {"productId": P["id"], "channel": "B2C", "customerType": "CONSUMER", "unitPrice": 100, "gstRatePercent": 5, "effectiveFrom": TODAY})
insp = must("POST", "/harvest-inspections", {"farmerId": farmer["id"], "cropName": "Wheat", "inspectionDate": TODAY, "moistureLevel": 11, "foreignMatter": 0.4, "grainSize": "Medium", "result": "APPROVED"})
coll = must("POST", "/collections", {"inspectionId": insp["id"], "branchId": BR, "collectionDate": TODAY, "collectionLocation": "Gate", "grossWeight": 1300, "netWeight": 1200, "warehouseId": WH_C, "purchaseRate": 25})
rm = next(b for b in rows(must("GET", f"/batches?warehouseId={WH_C}")) if b.get("collectionId") == coll["id"])
recipe = must("POST", "/recipes", {"recipeCode": f"R-OV-{STAMP}", "productId": P["id"], "name": P["name"], "productionType": "SINGLE_GRAIN", "batchYieldQuantity": 1100,
                                   "ingredients": [{"cropName": "Wheat", "quantity": 1200, "unit": "KG"}]})
must("PATCH", f"/recipes/{recipe['id']}/approve", {})
pb = must("POST", "/production-batches", {"recipeId": recipe["id"], "branchId": BR, "warehouseId": WH_C, "productionDate": TODAY, "plannedQuantity": 600,
                                          "consumptions": [{"rawMaterialBatchId": rm["id"], "quantityUsed": 600}]})
must("PATCH", f"/production-batches/{pb['id']}/complete", {"actualQuantity": 580})
FG = must("POST", "/finished-goods", {"productionBatchId": pb["id"], "packagingType": "pouch", "netWeight": 0.25, "packCount": 80, "mrp": 120,
                                      "packagingDate": TODAY, "manufacturingDate": TODAY, "shelfLifeDays": 120})
must("POST", "/quality-inspections", {"stage": "FINISHED_GOODS", "finishedGoodsBatchId": FG["id"], "productAppearance": "Good", "productWeight": 0.25, "result": "PASS"})
must("PATCH", f"/quality-inspections/release/{FG['id']}", {"warehouseId": WH_O})
must("POST", "/delivery-zones", {"name": f"OV Zone {STAMP}", "code": f"OV-{STAMP[-6:]}", "warehouseId": WH_O, "boundary": SQUARE,
                                 "targetMinMinutes": 15, "targetMaxMinutes": 20, "quickEnabled": True, "quickFee": 0})
must("PATCH", "/delivery/settings", {"autoOffer": True, "broadcastSize": 2, "offerTimeoutSeconds": 10, "maxOfferRounds": 1, "maxPickupDistanceKm": 5,
                                     "riderHeartbeatMinutes": 30, "maxCashInHand": None, "reattemptDelayMinutes": 0, "requireCodBeforeDelivery": False})


def rider(tag, name):
    phone = f"7{STAMP[-6:]}{tag:03d}"
    r = must("POST", "/rider/auth/signup", {"fullName": name, "phone": phone, "password": "Secret#123", "vehicleType": "SCOOTER", "vehicleNumber": f"mp04 ov {tag}"}, tok="-")
    sess = must("POST", "/rider/auth/verify", {"phone": phone, "code": r["devCode"]}, tok="-")
    clear_verification(sess["accessToken"])
    must("POST", f"/riders/{sess['rider']['id']}/approve", {"warehouseId": WH_O, "maxActiveTasks": 5})
    R = {"id": sess["rider"]["id"], "name": name, "phone": phone, "tok": sess["accessToken"]}
    must("POST", "/rider/availability", {"online": True, **LOC_OUT}, tok=R["tok"])
    return R


A = rider(1, "Anil Override")
B = rider(2, "Bina Override")

customers = {}


def customer(tag):
    if tag in customers:
        return customers[tag]
    phone = f"8{STAMP[-6:]}{tag:03d}"
    call("POST", "/storefront/auth/otp/request", {"phone": phone}, auth=False)
    _, sess = call("POST", "/storefront/auth/otp/verify", {"phone": phone, "code": "123456", "audience": "CUSTOMER", "fullName": f"OV Shopper {tag}"}, auth=False)
    tok = sess["accessToken"]
    addr = must("POST", "/storefront/addresses", {"label": "Home", "fullName": f"OV Shopper {tag}", "phone": "9876543210", "line1": "12 Test Street", "city": "Bhopal",
                                                  "state": "Madhya Pradesh", "pincode": "462016", "latitude": IN_LL[0], "longitude": IN_LL[1]}, tok=tok)["id"]
    customers[tag] = (tok, addr)
    return customers[tag]


def place(tag):
    ctok, addr = customer(tag)
    sess = must("POST", "/storefront/checkout/sessions", {"addressId": addr, "items": [{"productId": P["id"], "quantity": 2}], "paymentMode": "COD", "deliverySpeed": "QUICK"}, tok=ctok)
    placed = must("POST", f"/storefront/checkout/sessions/{sess['sessionId']}/confirm", {}, tok=ctok)
    oid = placed.get("orderId") or placed.get("id")
    return oid


def pack(oid):
    plan = must("POST", f"/orders/{oid}/start-packing", {})
    for p in plan["plan"]:
        must("POST", f"/orders/{oid}/scan", {"code": p["fgBatchNumber"]})


def order(oid):
    return must("GET", f"/orders/{oid}")


def task_of(oid):
    ts = rows(must("GET", f"/delivery/tasks?orderId={oid}"))
    return ts[0] if ts else None


def offer_of(R, task_id):
    return wait_for(lambda: next((x for x in must("GET", "/rider/offers", tok=R["tok"]) if x["taskId"] == task_id), None), timeout=20)


def override(oid, status, reason="Scanner down - checked by hand"):
    return call("POST", f"/orders/{oid}/override-status", {"status": status, "reason": reason})


def otp_of(oid, tag):
    num = order(oid)["orderNumber"]
    return must("GET", f"/storefront/orders/{num}", tok=customer(tag)[0])["deliveryOtp"]


# ---------------------------------------------------------------- A
step("A. The order screen sees the live delivery")
O1 = place(1)
pack(O1)
T1 = wait_for(lambda: task_of(O1))
offer_of(A, T1["id"])
d = order(O1)
dt = d.get("deliveryTask")
check(dt is not None and dt["status"] == "OFFERED" and dt["taskNumber"] == T1["taskNumber"], "GET /orders/:id carries the delivery task", dt)
check(dt and {o["rider"]["fullName"] for o in dt["offers"]} == {A["name"], B["name"]}, "it lists who the order is offered to", dt and dt["offers"])
check(dt and all(0 < o["secondsLeft"] <= 10 for o in dt["offers"]), "each open offer carries server-measured seconds left", dt and [o["secondsLeft"] for o in dt["offers"]])
check(d["status"] == "PACKED", "the order is still PACKED while riders are being asked", d["status"])

# ---------------------------------------------------------------- B
step("B. Offer timing: a just-late accept still wins; a really late one is a clear 409")
ofA = offer_of(A, T1["id"])
check(isinstance(ofA.get("secondsLeft"), int) and 0 < ofA["secondsLeft"] <= 10, "the rider app gets secondsLeft (server clock)", ofA.get("secondsLeft"))
time.sleep(ofA["secondsLeft"] + 1.5)  # the countdown has hit 0; the tap is "in flight"
s, res = call("POST", f"/rider/offers/{ofA['offerId']}/accept", tok=A["tok"])
check(s == 200 and res.get("status") == "ACCEPTED", "an accept 1.5 s past the deadline (within the grace) is accepted", (s, res))
t1 = must("GET", f"/delivery/tasks/{T1['id']}")
check(t1["status"] == "ASSIGNED" and t1["rider"]["id"] == A["id"], "the task is Anil's", {"status": t1["status"], "rider": t1["rider"]})

O2 = place(2)
pack(O2)
T2 = wait_for(lambda: task_of(O2))
ofB = offer_of(B, T2["id"])
time.sleep(ofB["secondsLeft"] + 7)  # past deadline + grace, and past a sweep
s, res = call("POST", f"/rider/offers/{ofB['offerId']}/accept", tok=B["tok"])
check(s == 409 and isinstance(res, dict) and res.get("code") == "OFFER_EXPIRED", "a really late accept is 409 OFFER_EXPIRED (no 200 the app could misread)", (s, res))
check(not any(x["taskId"] == T2["id"] for x in must("GET", "/rider/offers", tok=B["tok"])), "the expired request is no longer in the rider's list")

# ---------------------------------------------------------------- C
step("C. Staff assign a registered rider: the order stays PACKED until pickup")
t2 = wait_for(lambda: (lambda t: t if t["needsManualAssignment"] else None)(must("GET", f"/delivery/tasks/{T2['id']}")), timeout=15)
check(t2 is not None, "nobody accepted (1 round): flagged for staff", t2 and {k: t2[k] for k in ("status", "needsManualAssignment")})
must("POST", f"/orders/{O2}/assign-rider", {"riderName": B["name"], "riderPhone": B["phone"]})
must("POST", f"/orders/{O2}/assign-rider", {"riderName": B["name"], "riderPhone": B["phone"]})  # staff clicked twice
d2 = order(O2)
check(d2["status"] == "PACKED", "assigning an app rider no longer jumps the order to DISPATCHED", d2["status"])
check(d2["deliveryTask"]["status"] == "ASSIGNED" and d2["deliveryTask"]["rider"]["id"] == B["id"], "the delivery is Bina's", d2["deliveryTask"])
must("POST", f"/rider/tasks/{T2['id']}/arrived-pickup", LOC_OUT, tok=B["tok"])
must("POST", f"/rider/tasks/{T2['id']}/picked-up", LOC_OUT, tok=B["tok"])
check(order(O2)["status"] == "DISPATCHED", "pickup moved it to DISPATCHED (stock leaves with the goods)")
must("POST", f"/rider/tasks/{T2['id']}/start", LOC_OUT, tok=B["tok"])
must("POST", f"/rider/tasks/{T2['id']}/arrived", LOC_DROP, tok=B["tok"])
must("POST", f"/rider/tasks/{T2['id']}/deliver", {"otp": otp_of(O2, 2), **LOC_DROP}, tok=B["tok"])
check(order(O2)["status"] == "DELIVERED", "delivered with the customer's OTP")

# ---------------------------------------------------------------- D
step("D. Status override")
O5 = place(5)
s, bad = override(O5, "PACKED", "no")
check(s == 400, "a reason is required (too short refused)", bad)
lt_email = f"ov-lt-{STAMP}@svv.test"
must("POST", "/users", {"email": lt_email, "password": "E2e@12345", "fullName": "OV Logistics", "role": "LOGISTICS_TEAM", "branchId": BR})
lt_tok = must("POST", "/auth/login", {"email": lt_email, "password": "E2e@12345"}, tok="-")["accessToken"]
s, bad = call("POST", f"/orders/{O5}/override-status", {"status": "PACKED", "reason": "Trying without permission"}, tok=lt_tok)
check(s == 403, "staff without orders.override are refused (403)", (s, bad))

s, r = override(O5, "PACKED")
check(s == 200 and r["order"]["status"] == "PACKED" and r["from"] == "PLACED", "PLACED -> PACKED by override", (s, r))
plan = must("GET", f"/orders/{O5}/pick-plan")
check(plan and all(p["scanned"] for p in plan), "batches were really allocated (FIFO) and marked checked", plan)
ev = [e["type"] for e in order(O5)["events"]]
check("STATUS_OVERRIDE" in ev and "CONFIRMED" in ev and "ALLOCATED" in ev and "PACKED" in ev, "timeline: each skipped step + STATUS_OVERRIDE with the reason", ev)
note = next(e["note"] for e in order(O5)["events"] if e["type"] == "STATUS_OVERRIDE")
check("PLACED → PACKED" in note and "Scanner down" in note, "the override note says from, to and why", note)
T5 = wait_for(lambda: task_of(O5))
check(T5 is not None, "a packed local order gets its delivery as usual (broadcast)", T5)
offer_of(A, T5["id"])

s, r = override(O5, "ALLOCATED", "Wrong item packed - repack")
check(s == 200 and r["order"]["status"] == "ALLOCATED", "PACKED -> ALLOCATED (back) allowed", (s, r))
t5 = must("GET", f"/delivery/tasks/{T5['id']}")
check(t5["status"] == "CANCELLED" and not [x for x in t5["offers"] if x["status"] == "PENDING"], "the delivery was cancelled and its offers withdrawn", {"status": t5["status"], "offers": [x["status"] for x in t5["offers"]]})
check(not any(x["taskId"] == T5["id"] for x in must("GET", "/rider/offers", tok=A["tok"])), "the rider no longer sees the request")
plan = must("GET", f"/orders/{O5}/pick-plan")
check(plan and not any(p["scanned"] for p in plan), "scans cleared - the batches must be verified again", plan)

s, r = override(O5, "CONFIRMED", "Re-allocate from fresher stock")
check(s == 200 and r["order"]["status"] == "CONFIRMED", "ALLOCATED -> CONFIRMED (back) allowed", (s, r))
check(must("GET", f"/orders/{O5}/pick-plan") == [], "batch reservations released (no live allocations)")
plan = must("POST", f"/orders/{O5}/start-packing", {})
check(plan["status"] == "ALLOCATED" and plan["plan"], "start packing works again afterwards", plan)

s, r = override(O5, "DELIVERED", "Customer collected at the counter")
check(s == 200 and r["order"]["status"] == "DELIVERED", "ALLOCATED -> DELIVERED forward in one go", (s, r))
d5 = order(O5)
check(d5["dispatchedAt"] and d5["deliveredAt"], "dispatch and delivery were stamped (stock out + invoice ran)", {k: d5[k] for k in ("dispatchedAt", "deliveredAt")})
check(not any(t["status"] not in ("CANCELLED", "DELIVERED") for t in rows(must("GET", f"/delivery/tasks?orderId={O5}"))), "no delivery left running for it")
fgnum = plan["plan"][0]["fgBatchNumber"]
tr = must("GET", f"/trace/{fgnum}")
check(farmer["fullName"] in json.dumps(tr) or farmer["id"] in json.dumps(tr), "the pack still traces back to the farmer", fgnum)
otr = must("GET", f"/orders/number/{d5['orderNumber']}/traceability")
check(farmer["fullName"] in json.dumps(otr), "the order's traceability resolves farmer -> raw batch -> production -> FG")

s, bad = override(O5, "PACKED", "Move it back")
check(s == 400 and "return" in json.dumps(bad).lower(), "after dispatch nothing moves back (a return instead)", bad)
s, bad = override(O5, "CANCELLED", "Cancel it")
check(s == 400, "a delivered order cannot be cancelled", bad)
s, bad = override(O5, "DELIVERED", "Again")
check(s == 400, "moving to the current status is refused", bad)

# ---------------------------------------------------------------- E
step("E. Override with a rider involved")
O6 = place(6)
pack(O6)
T6 = wait_for(lambda: task_of(O6))
of6 = offer_of(A, T6["id"])
must("POST", f"/rider/offers/{of6['offerId']}/accept", tok=A["tok"])
s, r = override(O6, "DISPATCHED", "Rider's app froze at pickup")
check(s == 200 and r["order"]["status"] == "DISPATCHED", "PACKED -> DISPATCHED by override", (s, r))
t6 = must("GET", f"/delivery/tasks/{T6['id']}")
check(t6["status"] == "ASSIGNED" and t6["rider"]["id"] == A["id"], "the rider who already had it keeps it", {"status": t6["status"]})
must("POST", f"/rider/tasks/{T6['id']}/picked-up", LOC_OUT, tok=A["tok"])
must("POST", f"/rider/tasks/{T6['id']}/start", LOC_OUT, tok=A["tok"])
must("POST", f"/rider/tasks/{T6['id']}/arrived", LOC_DROP, tok=A["tok"])
must("POST", f"/rider/tasks/{T6['id']}/deliver", {"otp": otp_of(O6, 6), **LOC_DROP}, tok=A["tok"])
check(order(O6)["status"] == "DELIVERED", "and finishes the delivery normally")

O7 = place(7)
pack(O7)
T7 = wait_for(lambda: task_of(O7))
offer_of(B, T7["id"])
s, r = override(O7, "CANCELLED", "Customer called to cancel")
check(s == 200 and r["order"]["status"] == "CANCELLED", "PACKED -> CANCELLED by override", (s, r))
check(must("GET", f"/delivery/tasks/{T7['id']}")["status"] == "CANCELLED", "its delivery was cancelled")
s, bad = override(O7, "PACKED", "Reopen")
check(s == 400, "a cancelled order cannot be reopened", bad)

# ---------------------------------------------------------------- F
step("F. Notifications: customers hear only accepted / out for delivery / delivered; staff hear what needs them")


def customer_titles(tag):
    return [n["title"] for n in must("GET", "/storefront/notifications", tok=customer(tag)[0])["items"]]


WANT = ["Order accepted", "Out for delivery", "Order delivered"]
for tag, how in ((2, "staff-assigned app rider"), (6, "broadcast accept + override to dispatched"), (5, "override straight to delivered")):
    got = wait_for(lambda: (lambda t: t if sorted(t) == sorted(WANT) else None)(customer_titles(tag)), timeout=40)
    check(got is not None, f"order {tag} ({how}): exactly accepted, out for delivery, delivered - once each", customer_titles(tag))
got7 = customer_titles(7)
check(got7 == ["Order accepted"], "cancelled order: only 'Order accepted' (packed / rider / cancel steps send nothing)", got7)

num2 = order(O2)["orderNumber"]
types2 = [t["type"] for t in must("GET", f"/storefront/orders/{num2}", tok=customer(2)[0])["timeline"]]
check(types2.count("RIDER_ASSIGNED") == 1, "the double-clicked rider assignment shows once in the customer's history", types2)
num5 = order(O5)["orderNumber"]
types5 = [t["type"] for t in must("GET", f"/storefront/orders/{num5}", tok=customer(5)[0])["timeline"]]
check("STATUS_OVERRIDE" not in types5 and "READY_FOR_PICKUP" not in types5, "staff-only steps (override, ready for pickup) are hidden from the customer", types5)

staff = must("GET", "/notifications/me/inbox")["items"]
titles = [n["title"] for n in staff]
check(sum(t.startswith("New order") for t in titles) == 5, "Super Admin bell: one 'New order' per storefront order (5 placed)", [t for t in titles if t.startswith("New order")][:3])
check(sum(t == "New rider registered" for t in titles) >= 2, "Super Admin bell: 'New rider registered' for each rider sign-up", titles[:12])
check(any(t == "Rider document to verify" for t in titles), "Super Admin bell: rider documents waiting to be verified")
new_order = next(n for n in staff if n["title"].startswith("New order"))
check(new_order["link"].startswith("/b2c-orders/"), "a new-order alert opens that order", new_order["link"])
must("POST", "/storefront/support-tickets", {"category": "DELIVERY_DELAY", "subject": "Where is my order?", "description": "It has not arrived yet, please check."}, tok=customer(7)[0])
tk = wait_for(lambda: next((n for n in must("GET", "/notifications/me/inbox")["items"] if n["title"].startswith("New support ticket")), None), timeout=10)
check(tk is not None and tk["link"] == "/support-tickets", "a new support ticket alerts staff", tk)

print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILURE(S)'}")
raise SystemExit(1 if failures else 0)
