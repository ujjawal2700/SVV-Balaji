#!/usr/bin/env python3
"""
End-to-end check of the percentage-based loyalty program against a RUNNING API.

  configure -> eligibility (product / category / default) -> estimate ->
  order -> dispatch (no points yet) -> DELIVER (points credited) ->
  customer balance + history -> partial/full returns (points reversed) ->
  setting changes (point value, cap, minimum, discounted rule) -> permissions

Creates its own uniquely-stamped data; safe to re-run. Restores the loyalty
settings it changed.

  SEED_SUPER_ADMIN_PASSWORD=... python e2e-loyalty-flow.py
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
CREATED_PRODUCTS = []
CREATED_CATEGORIES = []


def call(method, path, body=None, auth=True, tok=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    t = tok or (token if auth else "")
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


def must(method, path, body=None, expect=(200, 201), tok=None):
    status, data = call(method, path, body, tok=tok)
    if status not in expect:
        print(f"  FATAL {method} {path} -> HTTP {status}: {json.dumps(data)[:400]}")
        sys.exit(2)
    return data


def rows(data):
    return data["data"] if isinstance(data, dict) and "data" in data else data


def settings(**changes):
    return must("PATCH", "/loyalty/settings", changes)


# ---------------------------------------------------------------------------
step("1. Login, remember original settings")
status, login = call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD}, auth=False)
if status not in (200, 201):
    print("  FATAL login", status, login)
    sys.exit(2)
token = login["accessToken"]
ORIGINAL = must("GET", "/loyalty/settings")
RESTORE = {
    "isActive": ORIGINAL["isActive"], "earnPercentB2C": float(ORIGINAL["earnPercentB2C"]),
    "earnPercentB2B": float(ORIGINAL["earnPercentB2B"]), "pointValueInr": float(ORIGINAL["pointValueInr"]),
    "calculationBase": ORIGINAL["calculationBase"], "defaultEligible": ORIGINAL["defaultEligible"],
    "appliesToDiscountedProducts": ORIGINAL["appliesToDiscountedProducts"],
    "minEligibleItemAmount": None, "minEligibleOrderAmount": None, "maxRewardPerOrderInr": None,
    "pointsExpiryMonths": 0,
}
BASELINE = dict(RESTORE, isActive=True, earnPercentB2C=5, earnPercentB2B=2, pointValueInr=1,
                calculationBase="EXCLUDING_TAX", defaultEligible=True, appliesToDiscountedProducts=True)
s = settings(**BASELINE)
check(float(s["earnPercentB2C"]) == 5 and float(s["pointValueInr"]) == 1, "Super Admin configured 5% and 1 point = Rs 1")
status, bad = call("PATCH", "/loyalty/settings", {"earnPercentB2C": 150})
check(status == 400, "a percentage above 100 is refused")
status, bad = call("PATCH", "/loyalty/settings", {"pointValueInr": 0})
check(status == 400, "a zero point value is refused")

# ---------------------------------------------------------------------------
step("2. Infrastructure: branch, warehouse, farmer")
BR = rows(must("GET", "/branches"))[0]["id"]
WH = must("POST", "/warehouses", {"name": f"Loyalty Store {STAMP}", "location": "T", "branchId": BR, "capacity": 99999})["id"]
farmer = must("POST", "/farmers", {
    "fullName": f"Loyalty Farmer {STAMP}", "mobile": f"98{STAMP[-8:]}", "village": "Ashta", "district": "Sehore",
    "state": "Madhya Pradesh", "farmSizeAcres": 5, "cropDetails": "Wheat", "branchId": BR,
    "aadhaarNumber": f"{STAMP}12"[:12], "address": "Ashta", "landType": "Irrigated", "irrigationType": "Canal",
    "bankAccountName": "F", "bankName": "SBI", "bankAccountNo": f"{STAMP}00", "ifscCode": "SBIN0001234",
})
must("PATCH", f"/farmers/{farmer['id']}/verify", {"action": "APPROVED"})

cat_off = must("POST", "/categories", {"name": f"No Loyalty {STAMP}", "loyaltyEligibility": "NOT_ELIGIBLE"})
cat_inherit = must("POST", "/categories", {"name": f"Follows Default {STAMP}"})
CREATED_CATEGORIES.extend([cat_off["id"], cat_inherit["id"]])


def stocked_product(label, price, mrp=None, eligibility="INHERIT", category=None, qty=200):
    """A product with a B2C price and QA-released stock in WH."""
    body = {"name": f"{label} {STAMP}", "sku": f"{label.replace(' ', '-').upper()}-{STAMP}", "unit": "PACK",
            "showOnStorefront": True, "loyaltyEligibility": eligibility}
    if mrp:
        body["mrp"] = mrp
    if category:
        body["categoryId"] = category
    p = must("POST", "/products", body)
    CREATED_PRODUCTS.append(p["id"])
    must("POST", "/price-lists", {"productId": p["id"], "channel": "B2C", "customerType": "CONSUMER",
                                  "unitPrice": price, "gstRatePercent": 5, "effectiveFrom": TODAY})
    insp = must("POST", "/harvest-inspections", {"farmerId": farmer["id"], "cropName": "Wheat", "inspectionDate": TODAY,
                                                 "moistureLevel": 11, "foreignMatter": 0.4, "grainSize": "Medium", "result": "APPROVED"})
    coll = must("POST", "/collections", {"inspectionId": insp["id"], "branchId": BR, "collectionDate": TODAY,
                                         "collectionLocation": "Gate", "grossWeight": 700, "netWeight": 650,
                                         "warehouseId": WH, "purchaseRate": 25})
    rm = next(b for b in rows(must("GET", f"/batches?warehouseId={WH}")) if (b.get("collectionId") == coll["id"]))
    recipe = must("POST", "/recipes", {"recipeCode": f"R-{label.replace(' ', '-').upper()}-{STAMP}", "productId": p["id"], "name": label,
                                       "productionType": "SINGLE_GRAIN", "batchYieldQuantity": 600,
                                       "ingredients": [{"cropName": "Wheat", "quantity": 650, "unit": "KG"}]})
    must("PATCH", f"/recipes/{recipe['id']}/approve", {})
    pb = must("POST", "/production-batches", {"recipeId": recipe["id"], "branchId": BR, "warehouseId": WH,
                                              "productionDate": TODAY, "plannedQuantity": 300,
                                              "consumptions": [{"rawMaterialBatchId": rm["id"], "quantityUsed": 300}]})
    must("PATCH", f"/production-batches/{pb['id']}/complete", {"actualQuantity": 290})
    fg = must("POST", "/finished-goods", {"productionBatchId": pb["id"], "packagingType": "pouch", "netWeight": 0.25,
                                          "packCount": qty, "mrp": mrp or price, "packagingDate": TODAY,
                                          "manufacturingDate": TODAY, "shelfLifeDays": 180})
    must("POST", "/quality-inspections", {"stage": "FINISHED_GOODS", "finishedGoodsBatchId": fg["id"],
                                          "productAppearance": "Good", "productWeight": 0.25, "result": "PASS"})
    must("PATCH", f"/quality-inspections/release/{fg['id']}", {})
    return p


A = stocked_product("Eligible Atta", 100)                                # Rs 100 + 5% GST, no MRP
B = stocked_product("Excluded Oil", 100, eligibility="NOT_ELIGIBLE")     # product-level opt-out
C = stocked_product("Sale Besan", 100, mrp=200)                          # sold well below MRP = discounted
D = stocked_product("Cat Excluded Rice", 100, category=cat_off["id"])    # inherits the category's opt-out
E = stocked_product("Cat Override Dal", 100, eligibility="ELIGIBLE", category=cat_off["id"])  # opts back in
check(True, "5 stocked products (default, product opt-out, discounted, category opt-out, product opt-in override)")

# ---------------------------------------------------------------------------
step("3. Eligibility resolves: product -> category -> default (server-side, no frontend logic)")
e = must("GET", f"/loyalty/eligibility?productEligibility=INHERIT&categoryId={cat_off['id']}")
check(e["eligible"] is False and e["source"] == "CATEGORY", "inherit + opted-out category = not eligible (source CATEGORY)", e)
e = must("GET", f"/loyalty/eligibility?productEligibility=ELIGIBLE&categoryId={cat_off['id']}")
check(e["eligible"] is True and e["source"] == "PRODUCT", "product override beats the category", e)
e = must("GET", f"/loyalty/eligibility?productEligibility=INHERIT&categoryId={cat_inherit['id']}")
check(e["eligible"] is True and e["source"] == "DEFAULT", "inherit + inherit = program default", e)

# ---------------------------------------------------------------------------
step("4. Customer signs in (mock OTP) and gets a consumer record")
phone = f"9{STAMP[-9:]}"
_, otp = call("POST", "/storefront/auth/otp/request", {"phone": phone}, auth=False)
_, session = call("POST", "/storefront/auth/otp/verify", {"phone": phone, "code": otp["devCode"], "audience": "CUSTOMER", "fullName": "Loyal Shopper"}, auth=False)
CUST_TOKEN = session["accessToken"]
me = must("GET", "/storefront/auth/me", tok=CUST_TOKEN)
CUSTOMER_ID = me["customer"]["id"] if me.get("customer") else None
check(bool(CUSTOMER_ID), "consumer account has a commercial record", me)
mine = must("GET", "/storefront/loyalty", tok=CUST_TOKEN)
check(mine["balance"] == 0 and mine["enabled"] and mine["program"]["earnPercent"] == 5, "starts at 0 points, program shown with its 5%", mine["program"])

# ---------------------------------------------------------------------------
step("5. Estimate (what the product page / cart shows) - same engine as the real credit")
est = must("POST", "/storefront/loyalty/estimate", {"lines": [
    {"productId": A["id"], "quantity": 10}, {"productId": B["id"], "quantity": 5}], "channel": "B2C"}, tok=None)
check(est["points"] == 50 and est["eligibleAmount"] == 1000, "10 x Rs 100 eligible at 5% = 50 points; the opted-out product adds nothing", est)
check([l["eligible"] for l in est["lines"]] == [True, False], "per-line eligibility returned for the UI", est["lines"])

# ---------------------------------------------------------------------------
step("6. Order: nothing is earned until DELIVERED")


def place(items):
    o = must("POST", "/orders", {"customerId": CUSTOMER_ID, "warehouseId": WH,
                                 "items": [{"productId": p["id"], "quantity": q} for p, q in items]})
    must("PATCH", f"/orders/{o['id']}/confirm", {})
    must("POST", f"/orders/{o['id']}/allocate", {})
    must("PATCH", f"/orders/{o['id']}/pack", {})
    must("PATCH", f"/orders/{o['id']}/dispatch", {})
    return o


def balance():
    return must("GET", "/storefront/loyalty", tok=CUST_TOKEN)["balance"]


order1 = place([(A, 10), (B, 5)])
check(balance() == 0, "dispatched but not delivered: still 0 points")
check(must("GET", f"/loyalty/orders/{order1['orderNumber']}")["credited"] is False, "no earn record before delivery")

must("PATCH", f"/orders/{order1['id']}/deliver", {})
check(balance() == 50, "DELIVERED: 5% of the eligible Rs 1,000 = 50 points credited", balance())
bd = must("GET", f"/loyalty/orders/{order1['orderNumber']}")
check(bd["earn"]["points"] == 50 and bd["earn"]["rewardInr"] == 50 and bd["earn"]["eligibleAmount"] == 1000, "audit record: eligible Rs 1,000, reward Rs 50", bd["earn"])
by_name = {l["product"]: l for l in bd["earn"]["lines"]}
check(by_name[f"Excluded Oil {STAMP}"]["ineligibleReason"] == "PRODUCT_NOT_ELIGIBLE" and by_name[f"Eligible Atta {STAMP}"]["points"] == 50, "line breakdown explains the excluded item", bd["earn"]["lines"])
hk = must("POST", "/loyalty/housekeeping", {})
check(balance() == 50, "housekeeping / a repeat credit never pays the order twice", hk)

hist = must("GET", "/storefront/loyalty", tok=CUST_TOKEN)
row = next(h for h in hist["history"] if h["type"] == "LOYALTY_EARN")
check(row["points"] == 50 and row["orderNumber"] == order1["orderNumber"], "customer history shows the earning against the order", row)
check(hist["balanceValueInr"] == 50, "customer sees the balance's rupee value", hist["balanceValueInr"])

# ---------------------------------------------------------------------------
step("7. Returns reverse points, proportionally")
items = {i["productId"]: i["id"] for i in must("GET", f"/orders/{order1['id']}")["items"]}
r = must("POST", f"/orders/{order1['id']}/returns", {"items": [{"orderItemId": items[A["id"]], "quantity": 2}], "reason": "Damaged pouches"})
check(r["loyaltyPointsReversed"] == 10 and balance() == 40, "returning 2 of 10 eligible packs reverses 10 of 50 points", r)
r = must("POST", f"/orders/{order1['id']}/returns", {"items": [{"orderItemId": items[B["id"]], "quantity": 5}], "reason": "Wrong item"})
check(r["loyaltyPointsReversed"] == 0 and balance() == 40, "returning an INELIGIBLE item reverses nothing", r)
status, _ = call("POST", f"/orders/{order1['id']}/returns", {"items": [{"orderItemId": items[A["id"]], "quantity": 9}], "reason": "too many"})
check(status == 400, "cannot return more than was ordered (2 already back, 9 more > 10)")
r = must("POST", f"/orders/{order1['id']}/returns", {"items": [{"orderItemId": items[A["id"]], "quantity": 8}], "reason": "Recall of the lot"})
check(balance() == 0, "returning the rest brings the balance back to exactly 0 (no stranded rounding point)", balance())
bd = must("GET", f"/loyalty/orders/{order1['orderNumber']}")
check([x["reason"] for x in bd["ledger"]] == ["LOYALTY_EARN", "LOYALTY_REVERSAL", "LOYALTY_REVERSAL"], "ledger holds every earning and reversal for audit", bd["ledger"])
check(len(bd["returns"]) == 3, "returns are recorded with who/why", bd["returns"])
undelivered = place([(A, 1)])
status, _ = call("POST", f"/orders/{undelivered['id']}/returns", {"items": [{"orderItemId": undelivered["items"][0]["id"], "quantity": 1}], "reason": "x y z"})
check(status == 400, "a non-delivered order cannot have returns")

# ---------------------------------------------------------------------------
step("8. Rules are configurable and applied at credit time; past orders are never restated")
must("PATCH", f"/orders/{undelivered['id']}/deliver", {})  # 1 pack = Rs 100 -> 5 points
check(balance() == 5, "small order earns 5 points")

settings(pointValueInr=0.25)
o = place([(A, 10)]); must("PATCH", f"/orders/{o['id']}/deliver", {})
check(balance() == 5 + 200, "point value Rs 0.25: the same Rs 50 reward is 200 points", balance())
check(must("GET", "/storefront/loyalty", tok=CUST_TOKEN)["balanceValueInr"] == 51.25, "balance value uses the new point value (205 x Rs 0.25)")
check(must("GET", f"/loyalty/orders/{order1['orderNumber']}")["earn"]["pointValueApplied"] == 1, "the earlier order still records the point value it used")
settings(pointValueInr=1)

settings(earnPercentB2C=10)
o = place([(A, 10)]); must("PATCH", f"/orders/{o['id']}/deliver", {})
b = balance()
check(b == 205 + 100, "percentage changed to 10%: Rs 1,000 -> 100 points", b)
settings(earnPercentB2C=5)

settings(calculationBase="INCLUDING_TAX")
o = place([(A, 10)]); must("PATCH", f"/orders/{o['id']}/deliver", {})
check(balance() == 305 + 52, "base = including GST: 5% of Rs 1,050 = 52 points", balance())
settings(calculationBase="EXCLUDING_TAX")

settings(maxRewardPerOrderInr=20)
o = place([(A, 10)]); must("PATCH", f"/orders/{o['id']}/deliver", {})
bd = must("GET", f"/loyalty/orders/{o['orderNumber']}")
check(bd["earn"]["points"] == 20 and bd["earn"]["cappedByMax"] is True, "per-order cap of Rs 20 limits a Rs 50 reward", bd["earn"])
settings(maxRewardPerOrderInr=None)

settings(minEligibleOrderAmount=5000)
o = place([(A, 10)]); must("PATCH", f"/orders/{o['id']}/deliver", {})
bd = must("GET", f"/loyalty/orders/{o['orderNumber']}")
check(bd["earn"]["points"] == 0 and bd["earn"]["skipReason"] == "BELOW_MIN_ORDER", "below the minimum eligible order value earns nothing, with the reason stored", bd["earn"])
settings(minEligibleOrderAmount=None)

settings(minEligibleItemAmount=500)
o = place([(A, 2), (E, 10)]); must("PATCH", f"/orders/{o['id']}/deliver", {})
bd = must("GET", f"/loyalty/orders/{o['orderNumber']}")
small = next(l for l in bd["earn"]["lines"] if l["product"].startswith("Eligible Atta"))
check(small["ineligibleReason"] == "BELOW_MIN_ITEM" and bd["earn"]["points"] == 50, "a line under the minimum item value is skipped; the other line earns", bd["earn"]["lines"])
settings(minEligibleItemAmount=None)

step("9. Category rule and product override on a real order; discounted-product rule")
o = place([(D, 10), (E, 10)]); must("PATCH", f"/orders/{o['id']}/deliver", {})
bd = must("GET", f"/loyalty/orders/{o['orderNumber']}")
src = {l["product"].split(" ")[0] + l["product"].split(" ")[1]: l for l in bd["earn"]["lines"]}
d_line = next(l for l in bd["earn"]["lines"] if l["product"].startswith("Cat Excluded"))
e_line = next(l for l in bd["earn"]["lines"] if l["product"].startswith("Cat Override"))
check(d_line["eligible"] is False and d_line["eligibilitySource"] == "CATEGORY", "product inheriting an opted-out category earns nothing (source CATEGORY)", d_line)
check(e_line["eligible"] is True and e_line["eligibilitySource"] == "PRODUCT" and e_line["points"] == 50, "product override opts back in under that category", e_line)

o = place([(C, 10)]); must("PATCH", f"/orders/{o['id']}/deliver", {})
check(must("GET", f"/loyalty/orders/{o['orderNumber']}")["earn"]["points"] == 50, "discounted product earns while 'applies to discounted' is on")
settings(appliesToDiscountedProducts=False)
o = place([(C, 10)]); must("PATCH", f"/orders/{o['id']}/deliver", {})
bd = must("GET", f"/loyalty/orders/{o['orderNumber']}")
check(bd["earn"]["points"] == 0 and bd["earn"]["lines"][0]["ineligibleReason"] == "DISCOUNTED", "with it off, a line sold below MRP earns nothing (reason DISCOUNTED)", bd["earn"])
settings(appliesToDiscountedProducts=True)

step("10. Expiry is stamped on earned points; program off records but earns nothing")
settings(pointsExpiryMonths=12)
o = place([(A, 10)]); must("PATCH", f"/orders/{o['id']}/deliver", {})
h = must("GET", "/storefront/loyalty", tok=CUST_TOKEN)
newest = next(x for x in h["history"] if x["type"] == "LOYALTY_EARN")
check(newest["expiresAt"] is not None and newest["expiresAt"][:4] == str(date.today().year + 1), "earned points carry an expiry date 12 months out", newest)
check(h["program"]["expiryMonths"] == 12, "customer is told the expiry policy")
settings(pointsExpiryMonths=0)
settings(isActive=False)
before = balance()
o = place([(A, 10)]); must("PATCH", f"/orders/{o['id']}/deliver", {})
bd = must("GET", f"/loyalty/orders/{o['orderNumber']}")
check(balance() == before and bd["earn"]["skipReason"] == "PROGRAM_OFF", "program off: order delivered, recorded as PROGRAM_OFF, nothing earned", bd["earn"])
check(must("GET", "/storefront/loyalty", tok=CUST_TOKEN)["enabled"] is False, "customer app sees the program as off")
settings(isActive=True)

# ---------------------------------------------------------------------------
step("11. Permissions (also proves A-14: new keys reached already-configured roles on boot)")


def user_token(role):
    email, pw = f"{role.lower()}-{STAMP}@example.com", "E2e@12345"
    must("POST", "/users", {"email": email, "password": pw, "fullName": role, "role": role, "branchId": BR})
    _, lg = call("POST", "/auth/login", {"email": email, "password": pw}, auth=False)
    return lg["accessToken"]


logi = user_token("LOGISTICS_TEAM")
status, _ = call("GET", "/loyalty/settings", tok=logi)
check(status == 403, "logistics cannot view loyalty settings")
bm = user_token("BRANCH_MANAGER")
status, _ = call("GET", "/loyalty/settings", tok=bm)
check(status == 200, "branch manager can VIEW (loyalty.view reached the configured role automatically)")
status, _ = call("PATCH", "/loyalty/settings", {"earnPercentB2C": 9}, tok=bm)
check(status == 403, "...but only Super Admin can CONFIGURE (loyalty.manage)")
st = user_token("SALES_TEAM")
status, _ = call("POST", f"/orders/{order1['id']}/returns", {"items": [{"orderItemId": items[A["id"]], "quantity": 1}], "reason": "perm probe"}, tok=st)
check(status != 403, "sales team may record returns (orders.return granted automatically)", status)
status, _ = call("GET", "/storefront/loyalty", tok=None, auth=False)
check(status == 401, "the customer balance endpoint requires a customer session")

settings(**RESTORE)

# Leave the public storefront as we found it: unpublish the test products, hide the test categories.
for pid in CREATED_PRODUCTS:
    call("PATCH", f"/products/{pid}", {"showOnStorefront": False})
for cid in CREATED_CATEGORIES:
    call("PATCH", f"/categories/{cid}/active", {"isActive": False})

print("\n=============================================")
print(f"  Failed checks: {failures}")
print("=============================================")
sys.exit(1 if failures else 0)
