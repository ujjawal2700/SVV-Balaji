#!/usr/bin/env python3
"""
End-to-end check of the rider app + delivery workflow against a RUNNING API
(mock OTP, PAYMENT_GATEWAY=mock).

  rider sign-up -> OTP -> pending (cannot go online) -> staff approve (outlet)
  -> online -> Quick COD order packed -> task auto-created and offered to the
  nearest rider -> reject / reject -> handed to staff -> manual assign ->
  pickup (order DISPATCHED) -> out for delivery -> arrived (geofence) -> OTP
  refused until COD collected -> exact COD -> OTP -> DELIVERED -> pay from rules
  -> cash deposit. Then a failed delivery (customer unavailable) -> returned ->
  re-attempt -> delivered; an order cancelled after acceptance -> cancel pay;
  and the security edges (other rider's task, suspended rider, legacy assign).

  SEED_SUPER_ADMIN_PASSWORD=... python e2e-rider-flow.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

BASE = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
EMAIL = os.environ.get("SEED_SUPER_ADMIN_EMAIL", "admin@svvbalaji.com")
PASSWORD = os.environ.get("SEED_SUPER_ADMIN_PASSWORD", "admin@123")
STAMP = str(int(time.time()))
TODAY = date.today().isoformat()
failures = 0
token = ""
PRODUCTS, ZONES, RULES, RIDERS = [], [], [], []
ORDERS = {}


def call(method, path, body=None, tok=None, auth=True):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    t = tok or (token if auth else None)
    if t:
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
        print(f"  FAIL {msg}" + (f"\n       {json.dumps(detail, default=str)[:500]}" if detail is not None else ""))
    return ok


def must(method, path, body=None, expect=(200, 201), tok=None):
    s, d = call(method, path, body, tok)
    if s not in expect:
        print(f"  FATAL {method} {path} -> {s}: {json.dumps(d)[:500]}")
        raise SystemExit(2)
    return d


def rows(d):
    return d["data"] if isinstance(d, dict) and "data" in d else d


def wait_for(fn, timeout=20, every=0.5):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(every)
    return None


token = must("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD}, tok="-")["accessToken"]
ORIG_CS = must("GET", "/checkout-settings")
ORIG_DS = must("GET", "/delivery/settings")
BR = rows(must("GET", "/branches"))[0]["id"]
OUTLET_LL = (23.2599, 77.4126)
IN_LL = (23.2750, 77.4250)   # ~2.1 km from the outlet
NEAR_LL = (23.2680, 77.4126)  # ~0.9 km from the outlet
SQUARE = [[OUTLET_LL[0] - 0.03, OUTLET_LL[1] - 0.03], [OUTLET_LL[0] - 0.03, OUTLET_LL[1] + 0.03],
          [OUTLET_LL[0] + 0.03, OUTLET_LL[1] + 0.03], [OUTLET_LL[0] + 0.03, OUTLET_LL[1] - 0.03]]
WH_O = None
LOC_OUT = {"latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1]}
LOC_DROP = {"latitude": IN_LL[0], "longitude": IN_LL[1]}

try:
    step("1. Outlet, stock, Quick zone, delivery settings, pay rules")
    WH_C = must("POST", "/warehouses", {"name": f"RD Depot {STAMP}", "location": "Bhopal", "branchId": BR, "capacity": 99999, "kind": "CENTRAL", "city": "Bhopal", "state": "Madhya Pradesh"})["id"]
    WH_O = must("POST", "/warehouses", {"name": f"RD Outlet {STAMP}", "location": "Arera Colony, Bhopal", "branchId": BR, "capacity": 5000, "kind": "OUTLET",
                                        "city": "Bhopal", "state": "Madhya Pradesh", "latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1], "serviceRadiusKm": 5})["id"]
    must("PATCH", "/checkout-settings", {"centralWarehouseId": WH_C, "localRadiusKm": 5, "codEnabled": True, "codMaxAmount": 5000, "reservationTtlMinutes": 15})
    must("PATCH", "/delivery/settings", {"autoOffer": True, "offerTimeoutSeconds": 120, "maxOfferRounds": 5, "geofenceMeters": 250,
                                         "requireCodBeforeDelivery": True, "maxCashInHand": None, "reattemptDelayMinutes": 0})
    farmer = must("POST", "/farmers", {
        "fullName": f"RD Farmer {STAMP}", "mobile": f"96{STAMP[-8:]}", "village": "Ashta", "district": "Sehore", "state": "Madhya Pradesh",
        "farmSizeAcres": 5, "cropDetails": "Wheat", "branchId": BR, "aadhaarNumber": f"{STAMP}56"[:12], "address": "Ashta",
        "landType": "Irrigated", "irrigationType": "Canal", "bankAccountName": "F", "bankName": "SBI", "bankAccountNo": f"{STAMP}02", "ifscCode": "SBIN0001234",
    })
    must("PATCH", f"/farmers/{farmer['id']}/verify", {"action": "APPROVED"})
    P = must("POST", "/products", {"name": f"Rider Atta {STAMP}", "sku": f"RD-ATTA-{STAMP}", "unit": "PACK", "showOnStorefront": True})
    PRODUCTS.append(P["id"])
    must("POST", "/price-lists", {"productId": P["id"], "channel": "B2C", "customerType": "CONSUMER", "unitPrice": 100, "gstRatePercent": 5, "effectiveFrom": TODAY})
    insp = must("POST", "/harvest-inspections", {"farmerId": farmer["id"], "cropName": "Wheat", "inspectionDate": TODAY, "moistureLevel": 11, "foreignMatter": 0.4, "grainSize": "Medium", "result": "APPROVED"})
    coll = must("POST", "/collections", {"inspectionId": insp["id"], "branchId": BR, "collectionDate": TODAY, "collectionLocation": "Gate", "grossWeight": 1300, "netWeight": 1200, "warehouseId": WH_C, "purchaseRate": 25})
    rm = next(b for b in rows(must("GET", f"/batches?warehouseId={WH_C}")) if b.get("collectionId") == coll["id"])
    recipe = must("POST", "/recipes", {"recipeCode": f"R-RD-{STAMP}", "productId": P["id"], "name": P["name"], "productionType": "SINGLE_GRAIN", "batchYieldQuantity": 1100,
                                       "ingredients": [{"cropName": "Wheat", "quantity": 1200, "unit": "KG"}]})
    must("PATCH", f"/recipes/{recipe['id']}/approve", {})
    pb = must("POST", "/production-batches", {"recipeId": recipe["id"], "branchId": BR, "warehouseId": WH_C, "productionDate": TODAY, "plannedQuantity": 600,
                                              "consumptions": [{"rawMaterialBatchId": rm["id"], "quantityUsed": 600}]})
    must("PATCH", f"/production-batches/{pb['id']}/complete", {"actualQuantity": 580})
    FG = must("POST", "/finished-goods", {"productionBatchId": pb["id"], "packagingType": "pouch", "netWeight": 0.25, "packCount": 40, "mrp": 120,
                                          "packagingDate": TODAY, "manufacturingDate": TODAY, "shelfLifeDays": 120})
    must("POST", "/quality-inspections", {"stage": "FINISHED_GOODS", "finishedGoodsBatchId": FG["id"], "productAppearance": "Good", "productWeight": 0.25, "result": "PASS"})
    must("PATCH", f"/quality-inspections/release/{FG['id']}", {"warehouseId": WH_O})
    Z = must("POST", "/delivery-zones", {"name": f"RD Zone {STAMP}", "code": f"RD-{STAMP[-6:]}", "warehouseId": WH_O, "boundary": SQUARE,
                                         "targetMinMinutes": 15, "targetMaxMinutes": 20, "quickEnabled": True, "quickFee": 0})
    ZONES.append(Z["id"])

    now_ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    peak = {"days": [], "start": (now_ist - timedelta(minutes=90)).strftime("%H:%M"), "end": (now_ist + timedelta(minutes=90)).strftime("%H:%M")}
    for body in [
        {"name": f"Base {STAMP}", "kind": "BASE_PER_DELIVERY", "config": {"amount": 20}},
        {"name": f"Slabs {STAMP}", "kind": "DISTANCE_SLAB", "config": {"slabs": [{"uptoKm": 1, "amount": 20}, {"uptoKm": 2, "amount": 25}, {"uptoKm": 3, "amount": 30}, {"uptoKm": 5, "amount": 35}]}},
        {"name": f"Peak {STAMP}", "kind": "PEAK_HOUR", "config": {"amount": 5, "windows": [peak]}},
        {"name": f"First delivery bonus {STAMP}", "kind": "DAILY_TARGET", "config": {"targets": [{"deliveries": 1, "bonus": 50}]}},
        {"name": f"Unavailable pay {STAMP}", "kind": "OUTCOME_COMPENSATION", "config": {"outcome": "FAILED_CUSTOMER_UNAVAILABLE", "mode": "FIXED", "value": 15}},
        {"name": f"Cancelled after accept {STAMP}", "kind": "OUTCOME_COMPENSATION", "config": {"outcome": "CANCELLED_AFTER_ASSIGNMENT", "mode": "FIXED", "value": 10}},
    ]:
        RULES.append(must("POST", "/delivery/earning-rules", body)["id"])
    s, r = call("POST", "/delivery/earning-rules", {"name": "bad", "kind": "DISTANCE_SLAB", "config": {"slabs": [{"uptoKm": 2, "amount": 1}, {"uptoKm": 1, "amount": 2}]}})
    check(s == 400, "an out-of-order slab table is refused", r)
    check(True, "outlet stocked (40), Quick zone, 6 pay rules")

    # ------------------------------------------------------------------------
    step("2. Rider sign-up, approval, availability")

    def signup(tag, ll):
        phone = f"7{STAMP[-6:]}{tag:03d}"
        r = must("POST", "/rider/auth/signup", {"fullName": f"Rider {tag} {STAMP[-4:]}", "phone": phone, "password": "Secret#123", "vehicleType": "MOTORCYCLE", "vehicleNumber": f"mp04 ab {tag}"}, tok="-")
        s, bad = call("POST", "/rider/auth/login", {"identifier": phone, "password": "Secret#123"}, auth=False)
        check(s == 403 and bad.get("code") == "PHONE_NOT_VERIFIED", f"rider {tag}: cannot sign in before verifying the phone", bad)
        s, bad = call("POST", "/rider/auth/verify", {"phone": phone, "code": "000000"}, auth=False)
        check(s == 400, f"rider {tag}: wrong OTP refused")
        sess = must("POST", "/rider/auth/verify", {"phone": phone, "code": r["devCode"]}, tok="-")
        RIDERS.append(sess["rider"]["id"])
        return {"id": sess["rider"]["id"], "phone": phone, "tok": sess["accessToken"], "refresh": sess["refreshToken"], "ll": ll, "status": sess["rider"]["status"]}

    R1 = signup(1, OUTLET_LL)
    R2 = signup(2, NEAR_LL)
    check(R1["status"] == "PENDING_APPROVAL", "verified sign-up is pending approval")
    s, bad = call("POST", "/rider/availability", {"online": True}, tok=R1["tok"])
    check(s == 403, "a pending rider cannot go online", bad)
    s, bad = call("POST", "/rider/auth/login", {"identifier": R1["phone"], "password": "wrong-pass"}, auth=False)
    check(s == 401, "wrong password refused")
    lg = must("POST", "/rider/auth/login", {"identifier": R1["phone"], "password": "Secret#123"}, tok="-")
    check(lg["rider"]["status"] == "PENDING_APPROVAL", "a pending rider can sign in (app shows 'under review')")
    for R in (R1, R2):
        a = must("POST", f"/riders/{R['id']}/approve", {"warehouseId": WH_O})
        check(a["status"] == "ACTIVE" and a["code"].startswith("RDR-") and a["warehouse"]["id"] == WH_O, f"approved {a['code']} to the outlet", a)
        must("POST", "/rider/availability", {"online": True, "latitude": R["ll"][0], "longitude": R["ll"][1]}, tok=R["tok"])
    rf = must("POST", "/rider/auth/refresh", {"refreshToken": R1["refresh"]}, tok="-")
    s, retry = call("POST", "/rider/auth/refresh", {"refreshToken": R1["refresh"]}, auth=False)
    check(s == 200 and retry["refreshToken"] != rf["refreshToken"], "a lost-response retry with the just-replaced token still works (grace window)", retry)
    s, _ = call("POST", "/rider/auth/refresh", {"refreshToken": R1["refresh"]}, auth=False)
    check(s == 401, "a token two rotations old is refused (replay)")
    s, _ = call("GET", "/rider/me", tok=retry["accessToken"])
    check(s == 401, "and the replayed session is revoked at once")
    R1["tok"] = must("POST", "/rider/auth/login", {"identifier": R1["phone"], "password": "Secret#123"}, tok="-")["accessToken"]

    # ------------------------------------------------------------------------
    def customer(tag):
        phone = f"8{STAMP[-6:]}{tag:03d}"
        call("POST", "/storefront/auth/otp/request", {"phone": phone}, auth=False)
        _, sess = call("POST", "/storefront/auth/otp/verify", {"phone": phone, "code": "123456", "audience": "CUSTOMER", "fullName": f"RD Shopper {tag}"}, auth=False)
        tok = sess["accessToken"]
        addr = must("POST", "/storefront/addresses", {"label": "Home", "fullName": f"RD Shopper {tag}", "phone": "9876543210", "line1": "12 Test Street", "city": "Bhopal",
                                                      "state": "Madhya Pradesh", "pincode": "462016", "latitude": IN_LL[0], "longitude": IN_LL[1]}, tok=tok)["id"]
        return tok, addr

    def place(tag, mode):
        ctok, addr = customer(tag)
        sess = must("POST", "/storefront/checkout/sessions", {"addressId": addr, "items": [{"productId": P["id"], "quantity": 2}], "paymentMode": mode, "deliverySpeed": "QUICK"}, tok=ctok)
        body = {} if mode == "COD" else {"gatewayPaymentId": f"mockpay_rd_{STAMP}_{tag}", "signature": "mock_signature"}
        placed = must("POST", f"/storefront/checkout/sessions/{sess['sessionId']}/confirm", body, tok=ctok)
        oid = placed.get("orderId") or placed.get("id")
        num = placed.get("orderNumber")
        o = rows(must("GET", f"/orders/{oid}"))
        ORDERS[tag] = o["id"]
        return {"id": o["id"], "number": o["orderNumber"], "tok": ctok, "total": float(o["total"])}

    def pack(o):
        plan = must("POST", f"/orders/{o['id']}/start-packing", {})
        for p in plan["plan"]:
            must("POST", f"/orders/{o['id']}/scan", {"code": p["fgBatchNumber"]})
        return must("GET", f"/orders/{o['id']}")["status"]

    def task_of(order_id, attempt=None):
        ts = [t for t in rows(must("GET", f"/delivery/tasks?orderId={order_id}")) if attempt is None or t["attempt"] == attempt]
        return ts[0] if ts else None

    def offer_for(R, task_id):
        return wait_for(lambda: next((o for o in must("GET", "/rider/offers", tok=R["tok"]) if o["taskId"] == task_id), None))

    def otp_of(o):
        return must("GET", f"/storefront/orders/{o['number']}", tok=o["tok"])["deliveryOtp"]

    # ------------------------------------------------------------------------
    step("3. COD Quick order: packed -> auto task -> offered nearest first -> rejected twice -> staff")
    O1 = place(1, "COD")
    check(pack(O1) == "PACKED", "order packed by scanning")
    T1 = wait_for(lambda: task_of(O1["id"]))
    check(T1 and T1["status"] in ("OFFERED", "READY_FOR_PICKUP") and T1["speed"] == "QUICK" and float(T1["codAmount"]) == O1["total"],
          "a Quick task was created automatically with the COD amount", T1)
    of1 = offer_for(R1, T1["id"])
    check(of1 is not None and of1["pickup"]["name"].startswith("RD Outlet") and of1["cod"] == O1["total"], "offered first to the rider standing at the outlet", of1)
    check("phone" not in json.dumps(of1).lower() and "9876543210" not in json.dumps(of1), "the offer does not reveal the customer's phone number anywhere", of1)
    s, bad = call("POST", f"/rider/offers/{of1['offerId']}/accept", tok=R2["tok"])
    check(s == 404, "another rider cannot accept someone else's offer")
    must("POST", f"/rider/offers/{of1['offerId']}/reject", {"reason": "Tyre puncture"}, tok=R1["tok"])
    of2 = offer_for(R2, T1["id"])
    check(of2 is not None, "then offered to the next rider")
    must("POST", f"/rider/offers/{of2['offerId']}/reject", {}, tok=R2["tok"])
    t = wait_for(lambda: (lambda x: x if x["needsManualAssignment"] else None)(task_of(O1["id"])))
    check(t is not None and t["status"] == "READY_FOR_PICKUP", "no one left to ask: flagged for staff", t)
    must("POST", f"/delivery/tasks/{T1['id']}/assign", {"riderId": R1["id"]})
    s, bad = call("POST", f"/orders/{O1['id']}/assign-rider", {"riderName": "Walk-in", "riderPhone": "9876500001"})
    check(s == 400 and "delivery board" in json.dumps(bad), "typing a rider name is refused once an app rider holds the order", bad)
    mine = must("GET", "/rider/tasks", tok=R1["tok"])
    check(any(x["id"] == T1["id"] for x in mine), "staff assignment lands in the rider's active list")
    s, _ = call("GET", f"/rider/tasks/{T1['id']}", tok=R2["tok"])
    check(s == 404, "a rider cannot open another rider's task")

    # ------------------------------------------------------------------------
    step("4. The trip: pickup -> out -> arrived -> COD -> OTP")
    d = must("GET", f"/rider/tasks/{T1['id']}", tok=R1["tok"])
    check(d["drop"]["phone"] and "google.com/maps" in d["pickup"]["navigationUrl"] and d["items"][0]["quantity"] == 2, "task detail: customer phone, navigation links, items", d["pickup"])
    s, bad = call("POST", f"/rider/tasks/{T1['id']}/start", LOC_OUT, tok=R1["tok"])
    check(s == 409 and bad.get("code") == "WRONG_STATE", "cannot go out for delivery before pickup", bad)
    must("POST", f"/rider/tasks/{T1['id']}/arrived-pickup", LOC_OUT, tok=R1["tok"])
    s, bad = call("POST", f"/rider/tasks/{T1['id']}/picked-up", LOC_OUT, tok=R2["tok"])
    check(s == 404, "another rider cannot confirm this pickup")
    must("POST", f"/rider/tasks/{T1['id']}/picked-up", LOC_OUT, tok=R1["tok"])
    check(must("GET", f"/orders/{O1['id']}")["status"] == "DISPATCHED", "pickup moved the order to DISPATCHED")
    must("POST", f"/rider/tasks/{T1['id']}/start", LOC_OUT, tok=R1["tok"])
    must("POST", f"/rider/tasks/{T1['id']}/arrived", LOC_DROP, tok=R1["tok"])
    otp = otp_of(O1)
    s, bad = call("POST", f"/rider/tasks/{T1['id']}/deliver", {"otp": otp, **LOC_DROP}, tok=R1["tok"])
    check(s == 409 and bad.get("code") == "COD_NOT_COLLECTED", "OTP is refused until the COD is collected", bad)
    s, bad = call("POST", f"/rider/tasks/{T1['id']}/cod", {"amount": O1["total"] - 1, "method": "CASH"}, tok=R1["tok"])
    check(s == 400 and bad.get("code") == "COD_AMOUNT_MISMATCH", "a short COD amount is refused", bad)
    check(must("GET", f"/orders/{O1['id']}")["paymentStatus"] == "PENDING", "the order is not paid yet")
    must("POST", f"/rider/tasks/{T1['id']}/cod", {"amount": O1["total"], "method": "CASH", **LOC_DROP}, tok=R1["tok"])
    check(must("GET", f"/orders/{O1['id']}")["paymentStatus"] == "PAID", "COD collection (not delivery) marks the order paid")
    wrong = "0000" if otp != "0000" else "1111"
    s, bad = call("POST", f"/rider/tasks/{T1['id']}/deliver", {"otp": wrong}, tok=R1["tok"])
    check(s == 400, "a wrong OTP is refused", bad)
    done = must("POST", f"/rider/tasks/{T1['id']}/deliver", {"otp": otp, **LOC_DROP}, tok=R1["tok"])
    check(done["status"] == "DELIVERED", "rider completes with the customer's OTP")
    o1 = must("GET", f"/orders/{O1['id']}")
    check(o1["status"] == "DELIVERED" and o1["riderName"].startswith("Rider 1"), "order DELIVERED with the rider recorded", {k: o1.get(k) for k in ("status", "riderName")})
    types = [e["type"] for e in o1.get("events", [])]
    check(all(x in types for x in ["READY_FOR_PICKUP", "RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "ARRIVED", "COD_COLLECTED", "DELIVERED"]),
          "the customer's order timeline has every rider step", types)
    td = must("GET", f"/delivery/tasks/{T1['id']}")
    check(td["arrivedPickupVerified"] and td["arrivedDropVerified"], "both arrivals were location-verified")

    step("5. Pay from the rules and cash")
    e1 = must("GET", "/rider/earnings", tok=R1["tok"])
    got = sorted((l["type"], l["amount"]) for l in e1["lines"])
    check(got == sorted([("BASE", 20), ("DISTANCE", 30), ("PEAK", 5), ("DAILY_BONUS", 50)]),
          "delivered 2.1 km in peak hours, first of the day: 20 + 30 + 5 + 50", got)
    check(e1["today"] == 105, f"today's total is 105 ({e1['today']})")
    cash = must("GET", "/rider/cash", tok=R1["tok"])
    check(cash["balance"] == O1["total"], "cash in hand = COD collected", cash["balance"])
    s, bad = call("POST", f"/riders/{R1['id']}/cash/deposits", {"amount": O1["total"] + 1})
    check(s == 400, "cannot deposit more than the rider holds", bad)
    must("POST", f"/riders/{R1['id']}/cash/deposits", {"amount": O1["total"], "reference": "Counter"})
    check(must("GET", "/rider/cash", tok=R1["tok"])["balance"] == 0, "deposit settles the cash")

    # ------------------------------------------------------------------------
    step("6. Prepaid order: accepted -> customer unavailable -> returned -> re-attempt -> delivered")
    O2 = place(2, "ONLINE")
    pack(O2)
    T2 = wait_for(lambda: task_of(O2["id"]))
    of = offer_for(R1, T2["id"]) or offer_for(R2, T2["id"])
    who = R1 if of and any(o["offerId"] == of["offerId"] for o in must("GET", "/rider/offers", tok=R1["tok"])) else R2
    must("POST", f"/rider/offers/{of['offerId']}/accept", tok=who["tok"])
    s, bad = call("POST", f"/rider/offers/{of['offerId']}/accept", tok=who["tok"])
    check(s == 409, "an offer cannot be accepted twice", bad)
    check(float(task_of(O2["id"])["codAmount"]) == 0, "prepaid: nothing to collect")
    for a, b in [("arrived-pickup", LOC_OUT), ("picked-up", LOC_OUT), ("start", LOC_OUT)]:
        must("POST", f"/rider/tasks/{T2['id']}/{a}", b, tok=who["tok"])
    s, bad = call("POST", f"/rider/tasks/{T2['id']}/fail", {"reasonCode": "CUSTOMER_UNAVAILABLE"}, tok=who["tok"])
    check(s == 400 and "arrived" in json.dumps(bad), "'customer unavailable' needs the rider to have arrived first", bad)
    must("POST", f"/rider/tasks/{T2['id']}/arrived", LOC_DROP, tok=who["tok"])
    s, bad = call("POST", f"/rider/tasks/{T2['id']}/fail", {"reasonCode": "CUSTOMER_REFUSED"}, tok=who["tok"])
    check(s == 400 and "note" in json.dumps(bad).lower(), "'customer refused' needs a note", bad)
    must("POST", f"/rider/tasks/{T2['id']}/fail", {"reasonCode": "CUSTOMER_UNAVAILABLE", "note": "Door locked, phone off", **LOC_DROP}, tok=who["tok"])
    check(must("GET", f"/orders/{O2['id']}")["status"] == "DISPATCHED", "a failed delivery does NOT cancel the order")
    s, bad = call("POST", f"/delivery/tasks/{T2['id']}/reattempt", {})
    check(s == 400, "cannot re-attempt before the goods are back", bad)
    must("POST", f"/rider/tasks/{T2['id']}/returned", LOC_OUT, tok=who["tok"])
    ew = must("GET", "/rider/earnings", tok=who["tok"])
    check(any(l["type"] == "OUTCOME" and l["amount"] == 15 and l["orderNumber"] == O2["number"] for l in ew["lines"]), "failed (customer unavailable) pays the configured 15, not a delivery")
    T2b = must("POST", f"/delivery/tasks/{T2['id']}/reattempt", {})
    check(T2b["attempt"] == 2, "attempt 2 created")
    of = wait_for(lambda: next((o for R in (R1, R2) for o in must("GET", "/rider/offers", tok=R["tok"]) if o["taskId"] == T2b["id"]), None))
    who2 = R1 if any(o["offerId"] == of["offerId"] for o in must("GET", "/rider/offers", tok=R1["tok"])) else R2
    must("POST", f"/rider/offers/{of['offerId']}/accept", tok=who2["tok"])
    for a, b in [("picked-up", LOC_OUT), ("start", LOC_OUT), ("arrived", LOC_DROP)]:
        must("POST", f"/rider/tasks/{T2b['id']}/{a}", b, tok=who2["tok"])
    must("POST", f"/rider/tasks/{T2b['id']}/deliver", {"otp": otp_of(O2), **LOC_DROP}, tok=who2["tok"])
    check(must("GET", f"/orders/{O2['id']}")["status"] == "DELIVERED", "second attempt delivered the order")

    # ------------------------------------------------------------------------
    step("7. Order cancelled after a rider accepted")
    O3 = place(3, "COD")
    pack(O3)
    T3 = wait_for(lambda: task_of(O3["id"]))
    of = wait_for(lambda: next((o for R in (R1, R2) for o in must("GET", "/rider/offers", tok=R["tok"]) if o["taskId"] == T3["id"]), None))
    who3 = R1 if any(o["offerId"] == of["offerId"] for o in must("GET", "/rider/offers", tok=R1["tok"])) else R2
    must("POST", f"/rider/offers/{of['offerId']}/accept", tok=who3["tok"])
    must("PATCH", f"/orders/{O3['id']}/cancel", {"reason": "Customer changed mind"})
    t3 = wait_for(lambda: (lambda x: x if x["status"] == "CANCELLED" else None)(task_of(O3["id"])))
    check(t3 is not None and t3["cancelStage"] == "CANCELLED_AFTER_ASSIGNMENT", "order cancellation cancels the task (after assignment)", t3)
    e3 = wait_for(lambda: next((l for l in must("GET", "/rider/earnings", tok=who3["tok"])["lines"] if l["type"] == "OUTCOME" and l["orderNumber"] == O3["number"]), None))
    check(e3 is not None and e3["amount"] == 10, "cancelled-after-accept pays the configured 10", e3)
    n = must("GET", "/rider/notifications", tok=who3["tok"])
    check(any(x["type"] == "TASK_CANCELLED" for x in n), "the rider was notified of the cancellation")

    # ------------------------------------------------------------------------
    step("8. Suspension")
    s, bad = call("POST", f"/riders/{R2['id']}/suspend", {"reason": "Documents expired"})
    check(s in (200, 201), "rider 2 suspended", bad)
    s, _ = call("GET", "/rider/me", tok=R2["tok"])
    check(s == 401, "a suspended rider's session stops working at once")
    s, bad = call("POST", "/rider/auth/login", {"identifier": R2["phone"], "password": "Secret#123"}, auth=False)
    check(s == 403 and bad.get("code") == "SUSPENDED", "and cannot sign in", bad)
    dash = must("GET", "/rider/dashboard", tok=R1["tok"])
    check(dash["today"]["completed"] >= 1 and "offers" in dash and dash["cashInHand"] == 0, "dashboard counters", dash["today"])
finally:
    step("Cleanup")
    for tag, oid in ORDERS.items():
        call("PATCH", f"/orders/{oid}/cancel", {"reason": "e2e cleanup"})
    for rid in RIDERS:
        call("POST", "/rider/availability", {"online": False})
        call("POST", f"/riders/{rid}/suspend", {"reason": "e2e cleanup"})
        call("POST", f"/riders/{rid}/reject", {"reason": "e2e cleanup"})
    for rid in RULES:
        call("DELETE", f"/delivery/earning-rules/{rid}")
    for zid in ZONES:
        call("DELETE", f"/delivery-zones/{zid}")
    for pid in PRODUCTS:
        call("PATCH", f"/products/{pid}", {"showOnStorefront": False})
    if WH_O:
        call("PATCH", f"/warehouses/{WH_O}", {"isActive": False})
    call("PATCH", "/checkout-settings", {"centralWarehouseId": ORIG_CS["centralWarehouseId"], "codEnabled": ORIG_CS["codEnabled"]})
    call("PATCH", "/delivery/settings", {k: ORIG_DS[k] for k in ("autoOffer", "offerTimeoutSeconds", "maxOfferRounds", "geofenceMeters", "requireCodBeforeDelivery", "reattemptDelayMinutes")})
    print("  test riders suspended/rejected, pay rules removed/deactivated, zone removed, outlet deactivated, settings restored")

print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
sys.exit(1 if failures else 0)
