#!/usr/bin/env python3
"""
End-to-end check of the trace / freeze / recall flow against a RUNNING API.

  farmer -> raw batch -> production -> two FG batches -> QA release -> stock in
  -> orders -> dispatch -> freeze -> re-allocate -> recall -> public QR trace

Every step asserts; the script exits non-zero on the first failed expectation
group. Creates its own uniquely-stamped data, so it is safe to re-run.

  SEED_SUPER_ADMIN_PASSWORD=... python e2e-recall-flow.py
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
token = ""
failures = 0


def call(method, path, body=None, auth=True):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if auth and token:
        req.add_header("Authorization", f"Bearer {token}")
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


def step(title):
    print(f"\n==> {title}")


def check(ok, msg, detail=None):
    global failures
    if ok:
        print(f"  PASS {msg}")
    else:
        failures += 1
        print(f"  FAIL {msg}" + (f"\n       {detail}" if detail is not None else ""))
    return ok


def must(method, path, body=None, expect=(200, 201), label=None):
    status, data = call(method, path, body)
    if status not in expect:
        print(f"  FATAL {label or method + ' ' + path} -> HTTP {status}: {json.dumps(data)[:400]}")
        sys.exit(2)
    return data


def rows(data):
    return data["data"] if isinstance(data, dict) and "data" in data else data


# ---------------------------------------------------------------------------
step("1. Login + setup")
status, data = call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD}, auth=False)
if status not in (200, 201):
    print("  FATAL login failed", status, data)
    sys.exit(2)
token = data["accessToken"]
branch = rows(must("GET", "/branches"))[0]
BR = branch["id"]
wh = must("POST", "/warehouses", {"name": f"E2E Store {STAMP}", "location": "Test", "branchId": BR, "capacity": 50000})
WH = wh["id"]
check(True, f"branch + warehouse ready ({wh.get('name')})")

# ---------------------------------------------------------------------------
step("2. Farmer -> approved (registration completeness gate satisfied)")
farmer = must("POST", "/farmers", {
    "fullName": f"E2E Farmer {STAMP}", "mobile": f"98{STAMP[-8:]}", "village": "Ashta",
    "district": "Sehore", "state": "Madhya Pradesh", "farmSizeAcres": 5.5, "cropDetails": "Wheat",
    "branchId": BR, "aadhaarNumber": f"{STAMP}12"[:12], "address": "Ashta, Sehore", "landType": "Irrigated",
    "irrigationType": "Canal", "bankAccountName": "E2E Farmer", "bankName": "SBI",
    "bankAccountNo": f"{STAMP}00", "ifscCode": "SBIN0001234",
})
approved = must("PATCH", f"/farmers/{farmer['id']}/verify", {"action": "APPROVED", "remarks": "e2e"})
check(str(approved.get("farmerCode", "")).startswith("SVV-"), f"farmer approved, code {approved.get('farmerCode')}")

# ---------------------------------------------------------------------------
step("3. Harvest inspection -> collection -> raw material batch (RM)")
insp = must("POST", "/harvest-inspections", {
    "farmerId": farmer["id"], "cropName": "Wheat", "inspectionDate": TODAY,
    "moistureLevel": 11.2, "foreignMatter": 0.5, "grainSize": "Medium", "result": "APPROVED",
})
coll = must("POST", "/collections", {
    "inspectionId": insp["id"], "branchId": BR, "collectionDate": TODAY, "collectionLocation": "Farm gate",
    "grossWeight": 1050, "netWeight": 1000, "warehouseId": WH, "purchaseRate": 25.5,
})
batches = rows(must("GET", f"/batches?warehouseId={WH}"))
rm = next((b for b in batches if b.get("collectionId") == coll["id"] or b.get("collection", {}).get("id") == coll["id"]), batches[0])
RM_NO, RM_ID = rm["batchNumber"], rm["id"]
check(RM_NO.startswith("RM-"), f"raw material batch {RM_NO}")
must("POST", "/quality-inspections", {
    "stage": "RAW_MATERIAL", "rawMaterialBatchId": RM_ID, "moisture": 11.2, "purity": 99.1,
    "foreignMatter": 0.5, "result": "PASS",
})

# ---------------------------------------------------------------------------
step("4. Product + recipe + production run")
product = must("POST", "/products", {"name": f"E2E Atta {STAMP}", "sku": f"E2E-{STAMP}", "unit": "PACK", "showOnStorefront": True})
recipe = must("POST", "/recipes", {
    "recipeCode": f"E2E-{STAMP}", "productId": product["id"], "name": "E2E Wheat Flour",
    "productionType": "SINGLE_GRAIN", "batchYieldQuantity": 900,
    "ingredients": [{"cropName": "Wheat", "quantity": 1000, "unit": "KG"}],
})
must("PATCH", f"/recipes/{recipe['id']}/approve", {})
pb = must("POST", "/production-batches", {
    "recipeId": recipe["id"], "branchId": BR, "warehouseId": WH, "productionDate": TODAY,
    "plannedQuantity": 400, "operatorName": "E2E Operator", "machineName": "Chakki", "machineNumber": "M-7",
    "productionLine": "Line 2", "consumptions": [{"rawMaterialBatchId": RM_ID, "quantityUsed": 400}],
})
must("PATCH", f"/production-batches/{pb['id']}/complete", {"actualQuantity": 380})
must("POST", "/quality-inspections", {"stage": "IN_PROCESS", "productionBatchId": pb["id"], "grindingQuality": "Fine", "temperature": 41, "result": "PASS"})
check(pb["productionBatchNumber"].startswith("PB-"), f"production run {pb['productionBatchNumber']}")

# ---------------------------------------------------------------------------
step("5. Pack two FG batches (different shelf life) -> QA release -> stock in")
fgs = []
for label, life in (("old", 90), ("new", 180)):
    fg = must("POST", "/finished-goods", {
        "productionBatchId": pb["id"], "packagingType": "pouch", "netWeight": 5, "packCount": 35,
        "mrp": 250, "packagingDate": TODAY, "manufacturingDate": TODAY, "shelfLifeDays": life,
    })
    status, _ = call("POST", f"/finished-goods/{fg['id']}/stock", {"warehouseId": WH, "quantity": 35})
    check(status == 400, f"{fg['fgBatchNumber']} ({label}) cannot be stocked before QA release")
    must("POST", "/quality-inspections", {
        "stage": "FINISHED_GOODS", "finishedGoodsBatchId": fg["id"], "productAppearance": "Good",
        "productWeight": 5, "result": "PASS", "shelfLifeVerified": True,
    })
    must("PATCH", f"/quality-inspections/release/{fg['id']}", {})
    ps = must("GET", f"/finished-goods-stock?warehouseId={WH}")
    inw = sum(r["quantity"] for r in ps if r["fgBatch"]["id"] == fg["id"])
    check(inw == 35, f"{fg['fgBatchNumber']} auto-inwarded 35 packs on QA release", inw)
    dup, _ = call("POST", f"/finished-goods/{fg['id']}/stock", {"warehouseId": WH, "quantity": 1})
    check(dup == 400, "a manual stock-in on top of the auto-inward is refused (no double count)")
    fgs.append(fg)
OLD, NEW = fgs
check(True, f"released + stocked {OLD['fgBatchNumber']} (expires first) and {NEW['fgBatchNumber']}")

# ---------------------------------------------------------------------------
step("6. Public QR trace of a healthy batch")
status, tr = call("GET", f"/storefront/trace/{OLD['fgBatchNumber']}", auth=False)
check(status == 200 and tr.get("status") == "VERIFIED", "unauthenticated scan resolves, status VERIFIED", tr)
blob = json.dumps(tr)
for secret in (farmer["fullName"], farmer["mobile"], approved.get("farmerCode", "?"), "SBIN0001234", "purchaseRate"):
    check(secret not in blob, f"public trace does not leak '{secret[:12]}'")
check(tr["origin"]["regions"] == [{"village": "Ashta", "district": "Sehore", "state": "Madhya Pradesh"}], "origin is region-level", tr["origin"])
check(tr["quality"]["moisturePercent"] == 11.2, "lab moisture carried through from the RM inspection", tr["quality"])
q = tr["quality"]
check(q["rawMaterialPassed"] and q["inProcessPassed"] and q["finishedGoodsPassed"], "all three QC stages read from their own records", q)
status, _ = call("GET", "/storefront/trace/FG-00000000-999", auth=False)
check(status == 404, "unknown batch -> 404")

# ---------------------------------------------------------------------------
step("7. Orders: one dispatched, one allocated-only")
cust = must("POST", "/customers", {
    "channel": "B2B", "type": "DISTRIBUTOR", "name": f"E2E Distributors {STAMP}", "phone": f"97{STAMP[-8:]}",
    "gstin": f"29ABCDE{STAMP[-4:]}F1Z5", "billingAddress": "12 Market Road", "branchId": BR,
    "paymentTerms": "CREDIT_30", "creditLimit": 500000,
})
must("POST", "/price-lists", {
    "productId": product["id"], "channel": "B2B", "customerType": "DISTRIBUTOR", "unitPrice": 180,
    "gstRatePercent": 5, "effectiveFrom": TODAY,
})


def place(qty):
    return must("POST", "/orders", {"customerId": cust["id"], "warehouseId": WH, "items": [{"productId": product["id"], "quantity": qty}]})


shipped = place(10)
must("PATCH", f"/orders/{shipped['id']}/confirm", {})
alloc = must("POST", f"/orders/{shipped['id']}/allocate", {})
check(all(a["fgBatchNumber"] == OLD["fgBatchNumber"] for a in alloc["allocations"]), "FEFO picks the earlier-expiry batch first", alloc["allocations"])
must("PATCH", f"/orders/{shipped['id']}/pack", {})
must("PATCH", f"/orders/{shipped['id']}/dispatch", {})

pending = place(12)
must("PATCH", f"/orders/{pending['id']}/confirm", {})
must("POST", f"/orders/{pending['id']}/allocate", {})
must("PATCH", f"/orders/{pending['id']}/pack", {})
check(True, f"{shipped['orderNumber']} shipped, {pending['orderNumber']} packed but not dispatched")

# ---------------------------------------------------------------------------
step("8. Forward trace (recall analysis) before any hold")
fw = must("GET", f"/recall/forward?code={OLD['fgBatchNumber']}")
check(fw["totals"]["orders"] == 2 and fw["totals"]["customers"] == 1, "2 orders / 1 customer received the batch", fw["totals"])
check(fw["totals"]["packsShipped"] == 10 and fw["totals"]["packsAllocatedNotShipped"] == 12, "10 shipped, 12 allocated-not-shipped", fw["totals"])
fw_rm = must("GET", f"/recall/forward?code={RM_NO}")
check({b["fgBatchNumber"] for b in fw_rm["batches"]} == {OLD["fgBatchNumber"], NEW["fgBatchNumber"]}, "RM lot fans out to both FG batches")

step("9. Backward trace (root cause)")
bw = must("GET", f"/recall/backward/{OLD['fgBatchNumber']}")
check(bw["production"]["machine"] == "Chakki M-7" and bw["production"]["productionLine"] == "Line 2", "machine + line", bw["production"])
check(bw["production"]["lossPercent"] == 5, "milling loss 20 of 400 = 5%", bw["production"]["lossPercent"])
lot = bw["rawLots"][0]
check(lot["batchNumber"] == RM_NO and lot["weighingSlip"]["netWeight"] == 1000, "raw lot + weighing slip", lot)
check(lot["source"]["code"] == approved["farmerCode"] and lot["payout"] is not None, "farmer + payout record", lot)
check(bw["fifo"]["checked"] is True and bw["fifo"]["compliant"] is True, "FIFO respected (older batch shipped first)", bw["fifo"])

# ---------------------------------------------------------------------------
step("10. FREEZE the older batch")
status, data = call("POST", "/recall/hold", {"fgBatchNumbers": [OLD["fgBatchNumber"]], "status": "ON_HOLD", "reason": "x"})
check(status == 400, "a reason under 5 chars is refused")
res = must("POST", "/recall/hold", {"fgBatchNumbers": [OLD["fgBatchNumber"]], "status": "ON_HOLD", "reason": "Foreign particle complaint #1042"})
check(res["changed"] == [OLD["fgBatchNumber"]], "frozen", res)
status, tr = call("GET", f"/storefront/trace/{OLD['fgBatchNumber']}", auth=False)
check(tr.get("status") == "ON_HOLD" and "origin" in tr, "QR scan now says ON_HOLD (trace still shown)", tr.get("status"))

new_order = place(5)
must("PATCH", f"/orders/{new_order['id']}/confirm", {})
alloc = must("POST", f"/orders/{new_order['id']}/allocate", {})
check(all(a["fgBatchNumber"] == NEW["fgBatchNumber"] for a in alloc["allocations"]), "new allocation skips the frozen batch", alloc["allocations"])

status, data = call("PATCH", f"/orders/{pending['id']}/dispatch", {})
check(status == 400 and "ON_HOLD" in json.dumps(data), "dispatch of an order holding frozen packs is refused", data)

# ---------------------------------------------------------------------------
step("11. RE-ALLOCATE the affected, undispatched order")
fw = must("GET", f"/recall/forward?code={OLD['fgBatchNumber']}")
aff = [s for s in fw["batches"][0]["shipments"] if not s["shipped"]]
check(len(aff) == 1 and aff[0]["orderNumber"] == pending["orderNumber"], "forward trace lists the affected order with its id", aff)
status, data = call("POST", f"/orders/{shipped['id']}/reallocate", {})
check(status == 400, "a dispatched order cannot be re-allocated", data)
re = must("POST", f"/orders/{pending['id']}/reallocate", {})
check(re["complete"] and re["released"][0]["fgBatchNumber"] == OLD["fgBatchNumber"] and re["released"][0]["quantity"] == 12, "released 12 from the frozen batch", re["released"])
check(all(a["fgBatchNumber"] == NEW["fgBatchNumber"] for a in re["allocations"]), "re-picked from healthy stock", re["allocations"])
fw = must("GET", f"/recall/forward?code={OLD['fgBatchNumber']}")
check(fw["totals"]["packsAllocatedNotShipped"] == 0, "frozen batch no longer holds any pending reservation", fw["totals"])
must("PATCH", f"/orders/{pending['id']}/dispatch", {})
check(True, f"{pending['orderNumber']} dispatched from the healthy batch")

# ---------------------------------------------------------------------------
step("12. Release the hold, then RECALL")
must("POST", "/recall/hold", {"fgBatchNumbers": [OLD["fgBatchNumber"]], "status": "ACTIVE", "reason": "Lab cleared it"})
status, tr = call("GET", f"/storefront/trace/{OLD['fgBatchNumber']}", auth=False)
check(tr.get("status") == "VERIFIED", "released batch verifies again")
must("POST", "/recall/hold", {"fgBatchNumbers": [OLD["fgBatchNumber"]], "status": "RECALLED", "reason": "Confirmed contamination - recall"})
status, tr = call("GET", f"/storefront/trace/{OLD['fgBatchNumber']}", auth=False)
check(tr.get("status") == "RECALLED" and "do not consume" in tr.get("notice", "").lower(), "QR scan now shows the recall notice", tr)
check("origin" not in tr and "quality" not in tr and "Foreign" not in json.dumps(tr) and "contamination" not in json.dumps(tr).lower(), "recall response exposes no trace data or internal reason")
status, data = call("POST", "/recall/hold", {"fgBatchNumbers": [OLD["fgBatchNumber"]], "status": "ACTIVE", "reason": "trying to undo"})
check(status == 400, "a recall cannot be released", data)
status, data = call("PATCH", f"/quality-inspections/release/{OLD['id']}", {})
check(status == 400, "QA release cannot resurrect a recalled batch", data)
status, data = call("POST", f"/finished-goods/{OLD['id']}/stock", {"warehouseId": WH, "quantity": 1})
check(status == 400, "a recalled batch cannot be stocked in", data)

step("13. Audit trail + staff trace")
bw = must("GET", f"/recall/backward/{OLD['fgBatchNumber']}")
hist = [(h["fromStatus"], h["toStatus"]) for h in bw["holdHistory"]]
check(hist == [("ACTIVE", "RECALLED"), ("ON_HOLD", "ACTIVE"), ("ACTIVE", "ON_HOLD")], "three audited transitions, newest first", hist)
staff = must("GET", f"/trace/{OLD['fgBatchNumber']}")
check(staff["finishedBatch"]["holdStatus"] == "RECALLED", "staff trace reports RECALLED")
fw = must("GET", f"/recall/forward?code={OLD['fgBatchNumber']}")
check(fw["totals"]["customers"] == 1 and fw["totals"]["packsShipped"] == 10, "customers who already received packs are still identifiable", fw["totals"])
# The still-healthy sibling is untouched.
status, tr = call("GET", f"/storefront/trace/{NEW['fgBatchNumber']}", auth=False)
check(tr.get("status") == "VERIFIED", "sibling batch unaffected")

step("14. Storefront availability follows the hold")


def storefront_in_stock():
    _, cards = call("GET", "/storefront/catalogue/products?limit=100", auth=False)
    return next(c for c in cards if c["id"] == product["id"])["inStock"]


check(storefront_in_stock() is True, "storefront shows the product in stock (healthy batch has packs)")
must("POST", "/recall/hold", {"fgBatchNumbers": [NEW["fgBatchNumber"]], "status": "ON_HOLD", "reason": "Precautionary freeze"})
check(storefront_in_stock() is False, "freezing the last sellable batch takes the product out of stock on the storefront")
must("POST", "/recall/hold", {"fgBatchNumbers": [NEW["fgBatchNumber"]], "status": "ACTIVE", "reason": "Cleared"})
check(storefront_in_stock() is True, "releasing it restores availability")

step("15. Permissions: recall is not open to everyone")
lt_email, lt_pw = f"logistics-{STAMP}@example.com", "E2e@12345"
must("POST", "/users", {"email": lt_email, "password": lt_pw, "fullName": "E2E Logistics", "role": "LOGISTICS_TEAM", "branchId": BR})
status, login = call("POST", "/auth/login", {"email": lt_email, "password": lt_pw}, auth=False)
saved, token = token, login["accessToken"]
status, _ = call("GET", f"/recall/forward?code={OLD['fgBatchNumber']}")
check(status == 403, "logistics cannot read recall analysis", status)
status, _ = call("POST", "/recall/hold", {"fgBatchNumbers": [NEW["fgBatchNumber"]], "status": "ON_HOLD", "reason": "should be refused"})
check(status == 403, "logistics cannot freeze a batch", status)
status, _ = call("GET", f"/storefront/trace/{NEW['fgBatchNumber']}", auth=False)
check(status == 200, "...but the public QR trace stays open to everyone")
token = saved

# Leave the public storefront as we found it.
call("PATCH", f"/products/{product['id']}", {"showOnStorefront": False})

print("\n=============================================")
print(f"  Failed checks: {failures}")
print("=============================================")
sys.exit(1 if failures else 0)
