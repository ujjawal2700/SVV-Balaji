#!/usr/bin/env python3
"""
End-to-end check of zone-based Quick Delivery at checkout, against a RUNNING API
(mock OTP, PAYMENT_GATEWAY=mock).

  zone validation -> address -> zone lookup (boundary / pincode) -> Quick offered
  only inside a Quick zone -> ETA + fee from the zone (non-default numbers, so
  nothing hardcoded can pass) -> unavailable when out of stock at the outlet,
  closed, or out of product scope -> fallback STANDARD vs COURIER -> place a
  Quick order (speed + zone on the order, outlet as warehouse) -> cleanup.

Stock is made through the real chain (farmer -> raw batch -> production -> QA
release -> outlet transfer), like e2e-checkout-flow.py.

  SEED_SUPER_ADMIN_PASSWORD=... python e2e-quick-delivery-flow.py
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
PRODUCTS, ZONES, ORDERS = [], [], []


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
        print(f"  FAIL {msg}" + (f"\n       {json.dumps(detail, default=str)[:400]}" if detail is not None else ""))
    return ok


def must(method, path, body=None, expect=(200, 201), tok=None):
    s, d = call(method, path, body, tok)
    if s not in expect:
        print(f"  FATAL {method} {path} -> {s}: {json.dumps(d)[:400]}")
        raise SystemExit(2)
    return d


def rows(d):
    return d["data"] if isinstance(d, dict) and "data" in d else d


token = must("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD}, tok="-")["accessToken"]
ORIG_CS = must("GET", "/checkout-settings")
BR = rows(must("GET", "/branches"))[0]["id"]
OUTLET_LL = (23.2599, 77.4126)
IN_LL = (23.2750, 77.4250)     # ~2 km from the outlet, inside the square
FAR_LL = (22.7196, 75.8577)    # ~170 km away
SQUARE = [[OUTLET_LL[0] - 0.03, OUTLET_LL[1] - 0.03], [OUTLET_LL[0] - 0.03, OUTLET_LL[1] + 0.03],
          [OUTLET_LL[0] + 0.03, OUTLET_LL[1] + 0.03], [OUTLET_LL[0] + 0.03, OUTLET_LL[1] - 0.03]]
WH_O = None

try:
    step("1. Depot, outlet and stock (real production chain)")
    WH_C = must("POST", "/warehouses", {"name": f"QD Depot {STAMP}", "location": "Bhopal", "branchId": BR, "capacity": 99999, "kind": "CENTRAL", "city": "Bhopal", "state": "Madhya Pradesh"})["id"]
    WH_O = must("POST", "/warehouses", {"name": f"QD Outlet {STAMP}", "location": "Arera Colony", "branchId": BR, "capacity": 5000, "kind": "OUTLET",
                                        "city": "Bhopal", "state": "Madhya Pradesh", "latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1], "serviceRadiusKm": 5})["id"]
    must("PATCH", "/checkout-settings", {"centralWarehouseId": WH_C, "localRadiusKm": 5, "localBaseFee": 30, "localFreeAbove": 499, "shipBaseFee": 60,
                                         "shipFreeAbove": 999, "prepMinutes": 30, "minutesPerKm": 4, "shipMinDays": 3, "shipMaxDays": 6,
                                         "codEnabled": True, "codMaxAmount": 5000, "reservationTtlMinutes": 15})
    farmer = must("POST", "/farmers", {
        "fullName": f"QD Farmer {STAMP}", "mobile": f"97{STAMP[-8:]}", "village": "Ashta", "district": "Sehore", "state": "Madhya Pradesh",
        "farmSizeAcres": 5, "cropDetails": "Wheat", "branchId": BR, "aadhaarNumber": f"{STAMP}34"[:12], "address": "Ashta",
        "landType": "Irrigated", "irrigationType": "Canal", "bankAccountName": "F", "bankName": "SBI", "bankAccountNo": f"{STAMP}01", "ifscCode": "SBIN0001234",
    })
    must("PATCH", f"/farmers/{farmer['id']}/verify", {"action": "APPROVED"})

    def make_product(label, price):
        p = must("POST", "/products", {"name": f"{label} {STAMP}", "sku": f"QD-{label.replace(' ', '-').upper()}-{STAMP}", "unit": "PACK", "showOnStorefront": True})
        PRODUCTS.append(p["id"])
        must("POST", "/price-lists", {"productId": p["id"], "channel": "B2C", "customerType": "CONSUMER", "unitPrice": price, "gstRatePercent": 5, "effectiveFrom": TODAY})
        return p

    def stock(p, packs, wh):
        insp = must("POST", "/harvest-inspections", {"farmerId": farmer["id"], "cropName": "Wheat", "inspectionDate": TODAY, "moistureLevel": 11, "foreignMatter": 0.4, "grainSize": "Medium", "result": "APPROVED"})
        coll = must("POST", "/collections", {"inspectionId": insp["id"], "branchId": BR, "collectionDate": TODAY, "collectionLocation": "Gate", "grossWeight": 1300, "netWeight": 1200, "warehouseId": WH_C, "purchaseRate": 25})
        rm = next(b for b in rows(must("GET", f"/batches?warehouseId={WH_C}")) if b.get("collectionId") == coll["id"])
        recipe = must("POST", "/recipes", {"recipeCode": f"R-{p['sku']}", "productId": p["id"], "name": p["name"], "productionType": "SINGLE_GRAIN", "batchYieldQuantity": 1100,
                                           "ingredients": [{"cropName": "Wheat", "quantity": 1200, "unit": "KG"}]})
        must("PATCH", f"/recipes/{recipe['id']}/approve", {})
        pb = must("POST", "/production-batches", {"recipeId": recipe["id"], "branchId": BR, "warehouseId": WH_C, "productionDate": TODAY, "plannedQuantity": 600,
                                                  "consumptions": [{"rawMaterialBatchId": rm["id"], "quantityUsed": 600}]})
        must("PATCH", f"/production-batches/{pb['id']}/complete", {"actualQuantity": 580})
        fg = must("POST", "/finished-goods", {"productionBatchId": pb["id"], "packagingType": "pouch", "netWeight": 0.25, "packCount": packs, "mrp": 120,
                                              "packagingDate": TODAY, "manufacturingDate": TODAY, "shelfLifeDays": 120})
        must("POST", "/quality-inspections", {"stage": "FINISHED_GOODS", "finishedGoodsBatchId": fg["id"], "productAppearance": "Good", "productWeight": 0.25, "result": "PASS"})
        must("PATCH", f"/quality-inspections/release/{fg['id']}", {"warehouseId": wh})
        return fg

    P1 = make_product("Quick Atta", 100)   # stocked at the outlet
    P2 = make_product("Depot Besan", 60)   # depot only
    stock(P1, 30, WH_O)
    stock(P1, 30, WH_C)
    stock(P2, 30, WH_C)
    check(True, "P1 at the outlet and the depot; P2 only at the depot")

    # ------------------------------------------------------------------------
    step("2. Zone validation")
    base = {"name": f"Arera QD {STAMP}", "code": f"QD-{STAMP[-6:]}", "warehouseId": WH_O, "boundary": SQUARE,
            "targetMinMinutes": 12, "targetMaxMinutes": 18, "quickEnabled": True, "quickFee": 25, "quickFreeAbove": 10000}
    s, r = call("POST", "/delivery-zones", {**base, "targetMinMinutes": 30, "targetMaxMinutes": 20})
    check(s == 400, "min time above max is refused", r)
    s, r = call("POST", "/delivery-zones", {**base, "boundary": None})
    check(s == 400 and "covers nothing" in json.dumps(r), "a zone with no boundary, pincode or radius is refused", r)
    s, r = call("POST", "/delivery-zones", {**base, "pincodes": ["4620"]})
    check(s == 400, "a malformed pincode is refused", r)
    Z = must("POST", "/delivery-zones", base)
    ZONES.append(Z["id"])
    s, r = call("POST", "/delivery-zones", base)
    check(s == 409, "duplicate zone code is refused", r)

    t = must("POST", "/delivery-zones/test", {"latitude": IN_LL[0], "longitude": IN_LL[1]})
    check(t["zone"] and t["zone"]["id"] == Z["id"] and t["matchedBy"] == "BOUNDARY", "test tool: address inside the drawn boundary", t)
    t = must("POST", "/delivery-zones/test", {"latitude": FAR_LL[0], "longitude": FAR_LL[1]})
    check(t["zone"] is None, "test tool: far address is in no zone", t)

    # ------------------------------------------------------------------------
    step("3. Customer quotes")
    def new_customer(tag):
        phone = f"8{STAMP[-6:]}{tag:03d}"
        call("POST", "/storefront/auth/otp/request", {"phone": phone}, auth=False)
        _, sess = call("POST", "/storefront/auth/otp/verify", {"phone": phone, "code": "123456", "audience": "CUSTOMER", "fullName": f"QD Shopper {tag}"}, auth=False)
        return sess["accessToken"]

    def address(tok, ll=None, pincode="462016"):
        body = {"label": "Home", "fullName": "QD Shopper", "phone": "9876543210", "line1": "12 Test Street", "city": "Bhopal", "state": "Madhya Pradesh", "pincode": pincode}
        if ll:
            body.update(latitude=ll[0], longitude=ll[1])
        return must("POST", "/storefront/addresses", body, tok=tok)["id"]

    C = new_customer(1)
    A_IN, A_FAR, A_NOPIN = address(C, IN_LL), address(C, FAR_LL), address(C, None, "462016")

    def quote(addr, pid=None, qty=2, speed=None, expect=(200, 201)):
        body = {"addressId": addr, "items": [{"productId": pid or P1["id"], "quantity": qty}]}
        if speed:
            body["deliverySpeed"] = speed
        return call("POST", "/storefront/checkout/quote", body, tok=C)

    s, q = quote(A_IN)
    qo = (q or {}).get("deliveryOptions", {})
    check(s in (200, 201) and qo.get("quick", {}).get("available") is True, "inside the zone: Quick offered and available", qo)
    check(qo.get("quick", {}).get("etaLabel") == "12-18 min" and qo["quick"]["fee"] == 25, "Quick ETA and fee come from the zone (12-18 min, 25)", qo.get("quick"))
    check(q["fulfillment"]["speed"] == "STANDARD", "default stays STANDARD until the customer chooses Quick")

    s, q = quote(A_IN, speed="QUICK")
    f = (q or {}).get("fulfillment", {})
    check(s in (200, 201) and f.get("speed") == "QUICK" and f.get("method") == "LOCAL" and f.get("nodeId") == WH_O,
          "Quick chosen: served LOCAL from the zone outlet", f)
    check(f.get("etaLabel") == "12-18 min" and q["totals"]["deliveryFee"] == 25 and f.get("zoneId") == Z["id"], "order quote carries zone, ETA and fee", {k: f.get(k) for k in ("etaLabel", "zoneId")})

    s, q = quote(A_FAR)
    check(s in (200, 201) and (q or {}).get("deliveryOptions", {}).get("quick", "missing") is None, "outside every zone: Quick option not shown at all", q.get("deliveryOptions"))
    s, r = quote(A_FAR, speed="QUICK")
    check(s == 409 and r.get("code") == "QUICK_UNAVAILABLE", "asking for Quick outside a zone is refused (409)", r)

    s, q = quote(A_NOPIN)
    check(q["deliveryOptions"]["quick"] is None, "an unpinned address with an unlisted pincode gets no Quick")
    must("PATCH", f"/delivery-zones/{Z['id']}", {"pincodes": ["462016"]})
    s, q = quote(A_NOPIN)
    check((q["deliveryOptions"]["quick"] or {}).get("available") is True, "listing its pincode makes the unpinned address eligible", q["deliveryOptions"])
    must("PATCH", f"/delivery-zones/{Z['id']}", {"pincodes": []})

    # ------------------------------------------------------------------------
    step("4. When Quick cannot be promised")
    s, q = quote(A_IN, pid=P2["id"])
    qq = q["deliveryOptions"]["quick"]
    check(qq and qq["available"] is False and "not in stock" in qq["reason"], "not stocked at the outlet: offered but unavailable, with the reason", qq)
    check(q["fulfillment"]["method"] == "SHIPROCKET", "standard delivery still works (courier from the depot)")

    now_ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    day = (now_ist.weekday() + 1) % 7  # Python Mon=0 -> Sun=0
    closed = {"day": day, "open": "00:00", "close": (now_ist - timedelta(minutes=2)).strftime("%H:%M")} if now_ist.hour or now_ist.minute > 5 else {"day": (day + 1) % 7, "open": "09:00", "close": "10:00"}
    must("PATCH", f"/delivery-zones/{Z['id']}", {"operatingHours": [closed]})
    s, q = quote(A_IN)
    qq = q["deliveryOptions"]["quick"]
    check(qq and qq["available"] is False and "closed" in qq["reason"], "outside operating hours: unavailable, says closed", qq)
    check(q["fulfillment"]["method"] == "LOCAL", "fallback STANDARD: normal local delivery from the outlet in range")
    must("PATCH", f"/delivery-zones/{Z['id']}", {"fallback": "COURIER"})
    s, q = quote(A_IN)
    check(q["fulfillment"]["method"] == "SHIPROCKET", "fallback COURIER: ships by courier even though an outlet is in range", q["fulfillment"])
    must("PATCH", f"/delivery-zones/{Z['id']}", {"operatingHours": [], "fallback": "STANDARD"})

    cats = rows(must("GET", "/categories"))
    if cats:
        must("PATCH", f"/delivery-zones/{Z['id']}", {"productScope": "SELECTED_CATEGORIES", "categoryIds": [cats[0]["id"]]})
        s, q = quote(A_IN)
        qq = q["deliveryOptions"]["quick"]
        check(qq and qq["available"] is False and "not available for Quick" in qq["reason"], "product outside the zone's categories: unavailable", qq)
        must("PATCH", f"/delivery-zones/{Z['id']}", {"productScope": "ALL_PRODUCTS", "categoryIds": []})

    must("PATCH", f"/delivery-zones/{Z['id']}", {"quickEnabled": False})
    s, q = quote(A_IN)
    check(q["deliveryOptions"]["quick"] is None and q["fulfillment"]["method"] == "LOCAL", "Quick switched off for the zone: option hidden, normal delivery")
    must("PATCH", f"/delivery-zones/{Z['id']}", {"quickEnabled": True})

    # ------------------------------------------------------------------------
    step("5. Place a Quick COD order")
    sess = must("POST", "/storefront/checkout/sessions", {"addressId": A_IN, "items": [{"productId": P1["id"], "quantity": 2}], "paymentMode": "COD", "deliverySpeed": "QUICK"}, tok=C)
    placed = must("POST", f"/storefront/checkout/sessions/{sess['sessionId']}/confirm", {}, tok=C)
    oid = placed.get("orderId") or placed.get("order", {}).get("id") or placed.get("id")
    num = placed.get("orderNumber") or placed.get("order", {}).get("orderNumber")
    order = rows(must("GET", f"/orders/{oid}")) if oid else None
    if order:
        ORDERS.append(order["id"])
    check(order and order.get("deliverySpeed") == "QUICK" and order.get("deliveryZoneId") == Z["id"] and order.get("warehouseId") == WH_O,
          "order stored as QUICK, with its zone and the outlet as warehouse", {k: (order or {}).get(k) for k in ("deliverySpeed", "deliveryZoneId", "warehouseId")})
    mins = (datetime.fromisoformat(order["etaMax"].replace("Z", "+00:00")) - datetime.fromisoformat(order["orderDate"].replace("Z", "+00:00"))).total_seconds() / 60
    check(17 <= mins <= 19, f"promised by about 18 minutes after placing ({mins:.1f})")
    check(any(e["type"] == "PLACED" and "Quick Delivery" in (e.get("note") or "") for e in order.get("events", [])), "customer timeline says Quick Delivery")
finally:
    step("Cleanup")
    for oid in ORDERS:
        call("PATCH", f"/orders/{oid}/cancel", {"reason": "e2e cleanup"})
    for zid in ZONES:
        call("DELETE", f"/delivery-zones/{zid}")
    for pid in PRODUCTS:
        call("PATCH", f"/products/{pid}", {"showOnStorefront": False})
    if WH_O:
        call("PATCH", f"/warehouses/{WH_O}", {"isActive": False})
    call("PATCH", "/checkout-settings", {"localRadiusKm": float(ORIG_CS["localRadiusKm"]), "centralWarehouseId": ORIG_CS["centralWarehouseId"],
                                         "codEnabled": ORIG_CS["codEnabled"], "reservationTtlMinutes": ORIG_CS["reservationTtlMinutes"]})
    print("  orders cancelled, zone removed/deactivated, products hidden, test outlet deactivated, settings restored")

print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
sys.exit(1 if failures else 0)
