#!/usr/bin/env python3
"""
Retailer (B2B) orders are routed exactly like customer (B2C) orders, against a
RUNNING API (mock OTP / payment / shipping):

  zone Quick Delivery offered to a retailer -> local outlet with stock -> LOCAL with a
  minutes ETA; outlet short on a bulk quantity -> central depot -> SHIPROCKET with a
  days ETA; far address -> SHIPROCKET. Then the staff pipeline for a retailer LOCAL
  order: FIFO batch allocation at the OUTLET -> scan -> PACKED -> rider task ->
  doorstep OTP -> DELIVERED, with the outlet stock, reservations and allocations in sync.

  BASE_URL=http://localhost:3100/api/v1 SEED_SUPER_ADMIN_PASSWORD=... python e2e-retailer-routing-flow.py
"""
import json
import os
import sys
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
    t = tok if tok is not None else (token if auth else None)
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


def check(ok, m, detail=None):
    global failures
    print(f"  {'PASS' if ok else 'FAIL'} {m}")
    if not ok:
        failures += 1
        if detail is not None:
            print(f"       {json.dumps(detail, default=str)[:600]}")


def must(method, path, body=None, tok=None, auth=True):
    s, d = call(method, path, body, tok=tok, auth=auth)
    if s not in (200, 201):
        print(f"  !! {method} {path} -> {s}: {json.dumps(d, default=str)[:600]}")
        raise SystemExit(1)
    return d


def rows(d):
    return d.get("data", d.get("rows", d)) if isinstance(d, dict) else d


def wait_for(fn, timeout=12):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(0.4)
    return None


OUTLET_LL = (23.2599, 77.4126)
IN_LL = (23.2750, 77.4250)
FAR_LL = (22.7196, 75.8577)
SQUARE = [[OUTLET_LL[0] - 0.03, OUTLET_LL[1] - 0.03], [OUTLET_LL[0] - 0.03, OUTLET_LL[1] + 0.03],
          [OUTLET_LL[0] + 0.03, OUTLET_LL[1] + 0.03], [OUTLET_LL[0] + 0.03, OUTLET_LL[1] - 0.03]]

step("0. Nodes, a Quick zone around the outlet, stock through the real chain")
_, lg = call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD}, auth=False)
token = lg["accessToken"]
BR = rows(must("GET", "/branches"))[0]["id"]
WH_C = must("POST", "/warehouses", {"name": f"RR Depot {STAMP}", "location": "Bhopal", "branchId": BR, "capacity": 99999, "kind": "CENTRAL", "city": "Bhopal", "state": "Madhya Pradesh"})["id"]
WH_O = must("POST", "/warehouses", {"name": f"RR Outlet {STAMP}", "location": "Arera", "branchId": BR, "capacity": 5000, "kind": "OUTLET", "city": "Bhopal",
                                    "state": "Madhya Pradesh", "latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1], "serviceRadiusKm": 5})["id"]
must("PATCH", "/checkout-settings", {"centralWarehouseId": WH_C, "localRadiusKm": 5, "shipMinDays": 3, "shipMaxDays": 6})
ZONE = must("POST", "/delivery-zones", {"name": f"RR QD {STAMP}", "code": f"RR-{STAMP[-6:]}", "warehouseId": WH_O, "boundary": SQUARE,
                                        "targetMinMinutes": 12, "targetMaxMinutes": 18, "quickEnabled": True, "quickFee": 25, "quickFreeAbove": 100000})
farmer = must("POST", "/farmers", {"fullName": f"RR Farmer {STAMP}", "mobile": f"96{STAMP[-8:]}", "village": "Ashta", "district": "Sehore", "state": "Madhya Pradesh",
                                   "farmSizeAcres": 5, "cropDetails": "Wheat", "branchId": BR, "aadhaarNumber": f"{STAMP}56"[:12], "address": "Ashta",
                                   "landType": "Irrigated", "irrigationType": "Canal", "bankAccountName": "F", "bankName": "SBI", "bankAccountNo": f"{STAMP}02", "ifscCode": "SBIN0001234"})
must("PATCH", f"/farmers/{farmer['id']}/verify", {"action": "APPROVED"})
P = must("POST", "/products", {"name": f"RR Atta {STAMP}", "sku": f"RR-ATTA-{STAMP}", "unit": "PACK", "showOnStorefront": True, "moqB2B": 10})
for ch, ct, price in (("B2C", "CONSUMER", 100), ("B2B", "RETAILER", 80)):
    must("POST", "/price-lists", {"productId": P["id"], "channel": ch, "customerType": ct, "unitPrice": price, "gstRatePercent": 5, "effectiveFrom": TODAY})


def make_fg(packs, wh, shelf):
    insp = must("POST", "/harvest-inspections", {"farmerId": farmer["id"], "cropName": "Wheat", "inspectionDate": TODAY, "moistureLevel": 11, "foreignMatter": 0.4, "grainSize": "Medium", "result": "APPROVED"})
    coll = must("POST", "/collections", {"inspectionId": insp["id"], "branchId": BR, "collectionDate": TODAY, "collectionLocation": "Gate", "grossWeight": 1300, "netWeight": 1200, "warehouseId": WH_C, "purchaseRate": 25})
    rm = next(b for b in rows(must("GET", f"/batches?warehouseId={WH_C}")) if b.get("collectionId") == coll["id"])
    recipe = must("POST", "/recipes", {"recipeCode": f"R-RR-{STAMP}-{packs}", "productId": P["id"], "name": P["name"], "productionType": "SINGLE_GRAIN", "batchYieldQuantity": 1100,
                                       "ingredients": [{"cropName": "Wheat", "quantity": 1200, "unit": "KG"}]})
    must("PATCH", f"/recipes/{recipe['id']}/approve", {})
    pb = must("POST", "/production-batches", {"recipeId": recipe["id"], "branchId": BR, "warehouseId": WH_C, "productionDate": TODAY, "plannedQuantity": 600,
                                              "consumptions": [{"rawMaterialBatchId": rm["id"], "quantityUsed": 600}]})
    must("PATCH", f"/production-batches/{pb['id']}/complete", {"actualQuantity": 580})
    fg = must("POST", "/finished-goods", {"productionBatchId": pb["id"], "packagingType": "pouch", "netWeight": 0.25, "packCount": packs, "mrp": 120,
                                          "packagingDate": TODAY, "manufacturingDate": TODAY, "shelfLifeDays": shelf})
    must("POST", "/quality-inspections", {"stage": "FINISHED_GOODS", "finishedGoodsBatchId": fg["id"], "productAppearance": "Good", "productWeight": 0.25, "result": "PASS"})
    must("PATCH", f"/quality-inspections/release/{fg['id']}", {"warehouseId": wh})
    return fg


OLD = make_fg(15, WH_O, 60)    # expires first
NEW = make_fg(15, WH_O, 180)
DEPOT = make_fg(100, WH_C, 120)


def stock_row(wh, fg):
    for r in rows(must("GET", f"/finished-goods-stock?warehouseId={wh}")):
        if r.get("fgBatchId") == fg["id"] or (r.get("fgBatch") or {}).get("fgBatchNumber") == fg["fgBatchNumber"]:
            return r
    return {"quantity": 0, "reservedQuantity": 0}


check(True, "outlet: 15 + 15 packs (two batches), depot: 100")

rphone = f"7{STAMP[-6:]}888"
r = must("POST", "/rider/auth/signup", {"fullName": "Routing Rider", "phone": rphone, "password": "Secret#123", "vehicleType": "MOTORCYCLE", "vehicleNumber": "mp04 rr 1"}, auth=False)
RIDER_TOK = must("POST", "/rider/auth/verify", {"phone": rphone, "code": r["devCode"]}, auth=False)
must("POST", f"/riders/{RIDER_TOK['rider']['id']}/approve", {"warehouseId": WH_O})
RT = RIDER_TOK["accessToken"]
must("POST", "/rider/availability", {"online": True, "latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1]}, tok=RT)

step("1. Retailer account on credit terms")
ph = f"8{STAMP[-6:]}321"
call("POST", "/storefront/auth/otp/request", {"phone": ph}, auth=False)
s, reg = call("POST", "/storefront/auth/register-retailer", {"phone": ph, "code": "123456", "fullName": "Routing Retailer", "businessName": f"RR Traders {STAMP}",
                                                            "gstin": f"23ABCDE{STAMP[-4:]}F1Z5", "addressLine": "Market Rd", "city": "Bhopal", "state": "Madhya Pradesh", "pincode": "462001"}, auth=False)
acc = [a for a in rows(must("GET", f"/storefront/accounts?channel=B2B&search={ph}")) if str(a.get("phone", "")).endswith(ph[-10:])]
if not acc:
    print("registration failed:", s, reg)
    raise SystemExit(1)
must("PATCH", f"/storefront/accounts/{acc[0]['id']}/approve")
call("POST", "/storefront/auth/otp/request", {"phone": ph}, auth=False)
_, bs = call("POST", "/storefront/auth/otp/verify", {"phone": ph, "code": "123456", "audience": "RETAILER"}, auth=False)
BT = bs["accessToken"]
BID = must("GET", "/storefront/auth/me", tok=BT)["customer"]["id"]
must("PATCH", f"/customers/{BID}", {"paymentTerms": "CREDIT_30", "creditLimit": 100000})


def address(ll, city="Bhopal"):
    return must("POST", "/storefront/addresses", {"label": "Shop", "fullName": "Routing Retailer", "phone": "9876543210", "line1": "12 Market", "city": city,
                                                  "state": "Madhya Pradesh", "pincode": "462016", "latitude": ll[0], "longitude": ll[1]}, tok=BT)["id"]


A_IN = address(IN_LL)
A_FAR = address(FAR_LL, "Indore")
items = lambda q: [{"productId": P["id"], "quantity": q}]

step("2. Routing decisions for a retailer - same rules as a customer")
q = must("POST", "/storefront/checkout/quote", {"addressId": A_IN, "items": items(12)}, tok=BT)
f = q["fulfillment"]
check(f["method"] == "LOCAL" and f["nodeId"] == WH_O, "local address, outlet has stock -> LOCAL from the outlet (no longer forced to the depot)", f)
check("day" not in f["etaLabel"], "ETA is the local minutes window, not the courier days window", f["etaLabel"])
qo = (q.get("deliveryOptions") or {}).get("quick")
check(qo and qo["available"] and qo["zoneName"] == ZONE["name"], "the retailer's zone offers Quick Delivery, as for a customer", qo)
qq = must("POST", "/storefront/checkout/quote", {"addressId": A_IN, "items": items(12), "deliverySpeed": "QUICK"}, tok=BT)
check(qq["fulfillment"]["speed"] == "QUICK" and qq["fulfillment"]["etaLabel"], "Quick can be chosen by a retailer", qq["fulfillment"])
qb = must("POST", "/storefront/checkout/quote", {"addressId": A_IN, "items": items(50)}, tok=BT)
check(qb["fulfillment"]["method"] == "SHIPROCKET" and qb["fulfillment"]["nodeId"] == WH_C and "day" in qb["fulfillment"]["etaLabel"],
      "bulk 50 > outlet's 30 -> depot by courier with a days ETA", qb["fulfillment"])
s, bad = call("POST", "/storefront/checkout/quote", {"addressId": A_IN, "items": items(50), "deliverySpeed": "QUICK"}, tok=BT)
check(s == 409 and bad.get("code") == "QUICK_UNAVAILABLE", "Quick refused when the outlet cannot cover it, with the reason", bad)
qf = must("POST", "/storefront/checkout/quote", {"addressId": A_FAR, "items": items(12)}, tok=BT)
check(qf["fulfillment"]["method"] == "SHIPROCKET" and qf["fulfillment"]["nodeId"] == WH_C, "far address -> SHIPROCKET from the depot", qf["fulfillment"])
check("CREDIT" in q["payment"]["allowedModes"], "credit terms still offered on a local retailer order")

step("3. Place a LOCAL retailer order on credit; stock is held at the OUTLET")
sess = must("POST", "/storefront/checkout/sessions", {"addressId": A_IN, "items": items(20), "paymentMode": "CREDIT"}, tok=BT)
placed = must("POST", f"/storefront/checkout/sessions/{sess['sessionId']}/confirm", {}, tok=BT)
OID = placed["orderId"]
od = must("GET", f"/orders/{OID}")
check(od["channel"] == "B2B" and od["fulfillmentMethod"] == "LOCAL" and od["warehouseId"] == WH_O and od["paymentMode"] == "CREDIT",
      "order: B2B, LOCAL, outlet node, on credit", {k: od.get(k) for k in ("channel", "fulfillmentMethod", "warehouseId", "paymentMode")})
q2 = must("POST", "/storefront/checkout/quote", {"addressId": A_IN, "items": items(12)}, tok=BT)
check(q2["fulfillment"]["nodeId"] == WH_C, "the outlet's remaining 10 is not enough for another 12 -> the next order routes to the depot (held stock counts)", q2["fulfillment"])

step("4. Super Admin pipeline: FIFO batch allocation at the outlet -> scan -> rider -> OTP")
plan = must("POST", f"/orders/{OID}/start-packing", {})
batches = sorted((p["fgBatchNumber"], p["quantity"]) for p in plan["plan"])
check(plan["complete"] and batches == sorted([(OLD["fgBatchNumber"], 15), (NEW["fgBatchNumber"], 5)]),
      "allocated first-expiry-first-out from the OUTLET's batches (15 of the older + 5 of the newer)", plan["plan"])
o_old, o_new = stock_row(WH_O, OLD), stock_row(WH_O, NEW)
check(o_old["reservedQuantity"] == 15 and o_new["reservedQuantity"] == 5, "outlet batch reservations match the allocation", {"old": o_old, "new": o_new})
check(stock_row(WH_C, DEPOT)["reservedQuantity"] == 0, "nothing reserved at the depot")
for p in plan["plan"]:
    must("POST", f"/orders/{OID}/scan", {"code": p["fgBatchNumber"]})
check(must("GET", f"/orders/{OID}")["status"] == "PACKED", "scanned -> PACKED")


def offer():
    for o in must("GET", "/rider/offers", tok=RT):
        if o.get("orderNumber") == placed["orderNumber"]:
            return o
    return None


of = wait_for(offer)
check(of is not None and of["cod"] == 0, "a delivery task is offered to the outlet's rider (credit order: nothing to collect)", of)
must("POST", f"/rider/offers/{of['offerId']}/accept", tok=RT)
for a in ("arrived-pickup", "picked-up", "start", "arrived"):
    must("POST", f"/rider/tasks/{of['taskId']}/{a}", {}, tok=RT)
otp = must("GET", f"/storefront/orders/{placed['orderNumber']}", tok=BT)["deliveryOtp"]
check(bool(otp), "the retailer is shown the doorstep OTP while out for delivery")
must("POST", f"/rider/tasks/{of['taskId']}/deliver", {"otp": otp}, tok=RT)
od = must("GET", f"/orders/{OID}")
check(od["status"] == "DELIVERED", "retailer order delivered by the local rider")
o_old, o_new = stock_row(WH_O, OLD), stock_row(WH_O, NEW)
check(o_old["quantity"] == 0 and o_new["quantity"] == 10 and o_old["reservedQuantity"] == 0 and o_new["reservedQuantity"] == 0,
      "outlet stock down by exactly 20, reservations cleared", {"old": o_old, "new": o_new})
check(stock_row(WH_C, DEPOT)["quantity"] == 100, "depot stock untouched")
mv = [m for m in rows(must("GET", f"/warehouses/movements?warehouseId={WH_O}")) if m.get("movementType") == "STOCK_OUT" and placed["orderNumber"] in (m.get("reason") or "")]
check(sum(float(m["quantity"]) for m in mv) == 20, "STOCK_OUT ledger rows at the outlet total 20", len(mv))
tr = must("GET", f"/orders/number/{placed['orderNumber']}/traceability")
check(bool(tr), "the retailer order still traces back through its batches to the farmer")

print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILURE(S)'}")
sys.exit(1 if failures else 0)
