#!/usr/bin/env python3
"""
End-to-end check of BROADCAST dispatch against a RUNNING API (mock OTP,
PAYMENT_GATEWAY=mock). Run it against a throwaway database - it changes the
delivery settings and leaves test riders/orders behind.

  six riders around one outlet (distance, vehicle, online/offline differ)
  -> a packed Quick order is offered to the top 3 at once, never to the
     bicycle (order too heavy), the far rider (beyond the km limit) or the
     offline one; the admin candidate list says why
  -> the three accept at the same instant: exactly one wins, the other two
     get 409 OFFER_TAKEN, their offers close as TAKEN (repeated 5 times)
  -> rejections: the round stays open until the last rider answers; nobody
     left -> handed to staff
  -> timeout: an unanswered round moves on to the next riders
  -> staff override: pause auto-offer (offers withdrawn, sweep leaves it),
     assign a rider the dispatcher would skip; resume re-offers
  -> order limit: a rider at their limit is not offered more
  -> legacy "assign rider" to an outside driver racing an app accept: one wins

  SEED_SUPER_ADMIN_PASSWORD=... BASE_URL=http://localhost:3110/api/v1 python e2e-broadcast-dispatch-flow.py
"""
import json
import os
import threading
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


token = must("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD}, tok="-")["accessToken"]
BR = rows(must("GET", "/branches"))[0]["id"]
OUTLET_LL = (23.2599, 77.4126)
IN_LL = (23.2750, 77.4250)  # customer, ~2.1 km
SQUARE = [[OUTLET_LL[0] - 0.03, OUTLET_LL[1] - 0.03], [OUTLET_LL[0] - 0.03, OUTLET_LL[1] + 0.03],
          [OUTLET_LL[0] + 0.03, OUTLET_LL[1] + 0.03], [OUTLET_LL[0] + 0.03, OUTLET_LL[1] - 0.03]]

step("1. Outlet with stock, Quick zone, product with a pack weight")
WH_C = must("POST", "/warehouses", {"name": f"BC Depot {STAMP}", "location": "Bhopal", "branchId": BR, "capacity": 99999, "kind": "CENTRAL", "city": "Bhopal", "state": "Madhya Pradesh"})["id"]
WH_O = must("POST", "/warehouses", {"name": f"BC Outlet {STAMP}", "location": "Arera Colony, Bhopal", "branchId": BR, "capacity": 5000, "kind": "OUTLET",
                                    "city": "Bhopal", "state": "Madhya Pradesh", "latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1], "serviceRadiusKm": 5})["id"]
must("PATCH", "/checkout-settings", {"centralWarehouseId": WH_C, "localRadiusKm": 5, "codEnabled": True, "codMaxAmount": 50000, "reservationTtlMinutes": 15})
farmer = must("POST", "/farmers", {
    "fullName": f"BC Farmer {STAMP}", "mobile": f"95{STAMP[-8:]}", "village": "Ashta", "district": "Sehore", "state": "Madhya Pradesh",
    "farmSizeAcres": 5, "cropDetails": "Wheat", "branchId": BR, "aadhaarNumber": f"{STAMP}77"[:12], "address": "Ashta",
    "landType": "Irrigated", "irrigationType": "Canal", "bankAccountName": "F", "bankName": "SBI", "bankAccountNo": f"{STAMP}03", "ifscCode": "SBIN0001234",
})
must("PATCH", f"/farmers/{farmer['id']}/verify", {"action": "APPROVED"})
P = must("POST", "/products", {"name": f"Broadcast Atta {STAMP}", "sku": f"BC-ATTA-{STAMP}", "unit": "PACK", "showOnStorefront": True, "packWeightKg": 0.25})
check(float(P.get("packWeightKg") or 0) == 0.25, "product saved with a 0.25 kg pack weight", P.get("packWeightKg"))
must("POST", "/price-lists", {"productId": P["id"], "channel": "B2C", "customerType": "CONSUMER", "unitPrice": 100, "gstRatePercent": 5, "effectiveFrom": TODAY})
insp = must("POST", "/harvest-inspections", {"farmerId": farmer["id"], "cropName": "Wheat", "inspectionDate": TODAY, "moistureLevel": 11, "foreignMatter": 0.4, "grainSize": "Medium", "result": "APPROVED"})
coll = must("POST", "/collections", {"inspectionId": insp["id"], "branchId": BR, "collectionDate": TODAY, "collectionLocation": "Gate", "grossWeight": 1300, "netWeight": 1200, "warehouseId": WH_C, "purchaseRate": 25})
rm = next(b for b in rows(must("GET", f"/batches?warehouseId={WH_C}")) if b.get("collectionId") == coll["id"])
recipe = must("POST", "/recipes", {"recipeCode": f"R-BC-{STAMP}", "productId": P["id"], "name": P["name"], "productionType": "SINGLE_GRAIN", "batchYieldQuantity": 1100,
                                   "ingredients": [{"cropName": "Wheat", "quantity": 1200, "unit": "KG"}]})
must("PATCH", f"/recipes/{recipe['id']}/approve", {})
pb = must("POST", "/production-batches", {"recipeId": recipe["id"], "branchId": BR, "warehouseId": WH_C, "productionDate": TODAY, "plannedQuantity": 600,
                                          "consumptions": [{"rawMaterialBatchId": rm["id"], "quantityUsed": 600}]})
must("PATCH", f"/production-batches/{pb['id']}/complete", {"actualQuantity": 580})
FG = must("POST", "/finished-goods", {"productionBatchId": pb["id"], "packagingType": "pouch", "netWeight": 0.25, "packCount": 60, "mrp": 120,
                                      "packagingDate": TODAY, "manufacturingDate": TODAY, "shelfLifeDays": 120})
must("POST", "/quality-inspections", {"stage": "FINISHED_GOODS", "finishedGoodsBatchId": FG["id"], "productAppearance": "Good", "productWeight": 0.25, "result": "PASS"})
must("PATCH", f"/quality-inspections/release/{FG['id']}", {"warehouseId": WH_O})
must("POST", "/delivery-zones", {"name": f"BC Zone {STAMP}", "code": f"BC-{STAMP[-6:]}", "warehouseId": WH_O, "boundary": SQUARE,
                                 "targetMinMinutes": 15, "targetMaxMinutes": 20, "quickEnabled": True, "quickFee": 0})

step("2. Broadcast settings (validated)")
s, bad = call("PATCH", "/delivery/settings", {"vehicleMaxKg": {"TRUCK": 5}})
check(s == 400, "an unknown vehicle type is refused", bad)
s, bad = call("PATCH", "/delivery/settings", {"broadcastSize": 0})
check(s == 400, "broadcast size 0 is refused", bad)
DS = must("PATCH", "/delivery/settings", {"autoOffer": True, "broadcastSize": 3, "offerTimeoutSeconds": 120, "maxOfferRounds": 3, "maxPickupDistanceKm": 5,
                                          "riderHeartbeatMinutes": 30, "vehicleMaxKg": {"BICYCLE": 0.4}, "maxCashInHand": None, "reattemptDelayMinutes": 0})
check(DS["broadcastSize"] == 3 and float(DS["maxPickupDistanceKm"]) == 5 and DS["vehicleMaxKg"] == {"BICYCLE": 0.4}, "saved: 3 at a time, 5 km, bicycles up to 0.4 kg", DS)

step("3. Six riders around the outlet")


def km_north(km):
    return (OUTLET_LL[0] + km / 111.0, OUTLET_LL[1])


def rider(tag, name, vehicle, ll, online=True, limit=5):
    phone = f"6{STAMP[-6:]}{tag:03d}"
    r = must("POST", "/rider/auth/signup", {"fullName": name, "phone": phone, "password": "Secret#123", "vehicleType": vehicle, "vehicleNumber": f"mp04 bc {tag}"}, tok="-")
    sess = must("POST", "/rider/auth/verify", {"phone": phone, "code": r["devCode"]}, tok="-")
    rid = sess["rider"]["id"]
    must("POST", f"/riders/{rid}/approve", {"warehouseId": WH_O, "maxActiveTasks": limit})
    R = {"id": rid, "name": name, "tok": sess["accessToken"], "ll": ll}
    must("POST", "/rider/availability", {"online": True, "latitude": ll[0], "longitude": ll[1]}, tok=R["tok"])
    if not online:
        must("POST", "/rider/availability", {"online": False}, tok=R["tok"])
    return R


A = rider(1, "Asha Outlet", "SCOOTER", OUTLET_LL)
B = rider(2, "Bhanu Near", "MOTORCYCLE", km_north(0.9))
C = rider(3, "Chetan Mid", "SCOOTER", km_north(2.1))
D = rider(4, "Dev Bicycle", "BICYCLE", OUTLET_LL)
E = rider(5, "Esha Far", "SCOOTER", km_north(8))
F = rider(6, "Farid Offline", "SCOOTER", OUTLET_LL, online=False)
TOP3 = {A["id"], B["id"], C["id"]}
NAME = {R["id"]: R["name"] for R in (A, B, C, D, E, F)}

av = must("GET", f"/delivery/availability?warehouseId={WH_O}")
o = next((x for x in av["outlets"] if x["warehouseId"] == WH_O), None)
check(o and o["available"] == 5 and o["offline"] == 1, "admin availability: 5 available, 1 offline at the outlet", o)
check(av["autoOffer"] is True and av["broadcastSize"] == 3, "availability reports auto-offer on, 3 at a time", {k: av[k] for k in ("autoOffer", "broadcastSize")})

# ---------------------------------------------------------------- helpers
customers = {}


def customer(tag):
    if tag in customers:
        return customers[tag]
    phone = f"8{STAMP[-6:]}{tag:03d}"
    call("POST", "/storefront/auth/otp/request", {"phone": phone}, auth=False)
    _, sess = call("POST", "/storefront/auth/otp/verify", {"phone": phone, "code": "123456", "audience": "CUSTOMER", "fullName": f"BC Shopper {tag}"}, auth=False)
    tok = sess["accessToken"]
    addr = must("POST", "/storefront/addresses", {"label": "Home", "fullName": f"BC Shopper {tag}", "phone": "9876543210", "line1": "12 Test Street", "city": "Bhopal",
                                                  "state": "Madhya Pradesh", "pincode": "462016", "latitude": IN_LL[0], "longitude": IN_LL[1]}, tok=tok)["id"]
    customers[tag] = (tok, addr)
    return customers[tag]


def place_and_pack(tag):
    ctok, addr = customer(tag)
    sess = must("POST", "/storefront/checkout/sessions", {"addressId": addr, "items": [{"productId": P["id"], "quantity": 2}], "paymentMode": "COD", "deliverySpeed": "QUICK"}, tok=ctok)
    placed = must("POST", f"/storefront/checkout/sessions/{sess['sessionId']}/confirm", {}, tok=ctok)
    oid = placed.get("orderId") or placed.get("id")
    plan = must("POST", f"/orders/{oid}/start-packing", {})
    for p in plan["plan"]:
        must("POST", f"/orders/{oid}/scan", {"code": p["fgBatchNumber"]})
    return oid


def task_of(order_id):
    ts = rows(must("GET", f"/delivery/tasks?orderId={order_id}"))
    return ts[0] if ts else None


def pending_offers(task_id):
    t = must("GET", f"/delivery/tasks/{task_id}")
    return [x for x in t["offers"] if x["status"] == "PENDING"]


def rider_offer(R, task_id):
    return next((x for x in must("GET", "/rider/offers", tok=R["tok"]) if x["taskId"] == task_id), None)


def offered_round(task_id, n):
    """Wait until the task has n open offers; return {riderId: offerId} read from each rider's own app view."""
    if not wait_for(lambda: len(pending_offers(task_id)) == n, timeout=20):
        return None
    out = {}
    for R in (A, B, C, D, E, F):
        x = rider_offer(R, task_id)
        if x:
            out[R["id"]] = x["offerId"]
    return out


def race(calls):
    """Fire every call at the same instant; returns [(status, body)] in call order."""
    barrier = threading.Barrier(len(calls))
    results = [None] * len(calls)

    def run(i, fn):
        barrier.wait()
        results[i] = fn()

    threads = [threading.Thread(target=run, args=(i, fn)) for i, fn in enumerate(calls)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


# ---------------------------------------------------------------- broadcast + ranking
step("4. A packed order is offered to the top 3 riders at once")
O1 = place_and_pack(1)
T1 = wait_for(lambda: task_of(O1))
check(T1 is not None, "delivery task created when the order was packed", T1)
offers1 = offered_round(T1["id"], 3)
check(offers1 is not None and set(offers1) == TOP3, "round 1 went to Asha, Bhanu and Chetan together", {NAME.get(k, k): v for k, v in (offers1 or {}).items()})
check(D["id"] not in (offers1 or {}) and E["id"] not in (offers1 or {}) and F["id"] not in (offers1 or {}), "not to the bicycle, the 8 km rider or the offline rider")
T1d = must("GET", f"/delivery/tasks/{T1['id']}")
check(T1d["status"] == "OFFERED" and T1d["offerRound"] == 1 and float(T1d["weightKg"]) == 0.5, "task OFFERED in round 1, weight 2 x 0.25 = 0.5 kg", {k: T1d[k] for k in ("status", "offerRound", "weightKg")})
exp = {x["expiresAt"] for x in T1d["offers"] if x["status"] == "PENDING"} if "expiresAt" in (T1d["offers"][0] if T1d["offers"] else {}) else None
cand = must("GET", f"/delivery/tasks/{T1['id']}/candidates")
by = {r["id"]: r for r in cand["riders"]}
check([r["id"] for r in cand["riders"] if r["rank"]][:3] == [A["id"], B["id"], C["id"]], "admin candidate list ranks nearest first: Asha, Bhanu, Chetan", [(r["fullName"], r["rank"], r["km"]) for r in cand["riders"]])
check([x["code"] for x in by[D["id"]]["reasons"]] == ["VEHICLE"], "bicycle skipped: vehicle cannot carry 0.5 kg", by[D["id"]]["reasons"])
check([x["code"] for x in by[E["id"]]["reasons"]] == ["TOO_FAR"], "8 km rider skipped: too far from pickup", by[E["id"]]["reasons"])
check("OFFLINE" in [x["code"] for x in by[F["id"]]["reasons"]], "offline rider skipped: offline", by[F["id"]]["reasons"])
check(cand["weightKg"] == 0.5 and cand["broadcastSize"] == 3, "candidates report weight and broadcast size", {k: cand[k] for k in ("weightKg", "broadcastSize")})

# ---------------------------------------------------------------- atomic accept
step("5. All three accept at the same instant - exactly one wins (5 runs)")
wins = {}
for run in range(1, 6):
    if run == 1:
        oid, tid, offs = O1, T1["id"], offers1
    else:
        oid = place_and_pack(run)
        tid = wait_for(lambda: task_of(oid))["id"]
        offs = offered_round(tid, 3)
    if not check(offs is not None and set(offs) == TOP3, f"run {run}: offered to the same three", {NAME.get(k, k): v for k, v in (offs or {}).items()}):
        continue
    riders = [A, B, C]
    res = race([(lambda R=R: call("POST", f"/rider/offers/{offs[R['id']]}/accept", tok=R["tok"])) for R in riders])
    ok = [riders[i] for i, (s, _) in enumerate(res) if s in (200, 201)]
    lost = [(riders[i], b) for i, (s, b) in enumerate(res) if s == 409]
    check(len(ok) == 1 and len(lost) == 2, f"run {run}: one accept succeeded, two got 409", [(s, b) for s, b in res])
    check(all(b.get("code") == "OFFER_TAKEN" for _, b in lost), f"run {run}: losers told OFFER_TAKEN", [b for _, b in lost])
    t = must("GET", f"/delivery/tasks/{tid}")
    statuses = sorted(x["status"] for x in t["offers"])
    check(ok and t["status"] == "ASSIGNED" and t["rider"]["id"] == ok[0]["id"], f"run {run}: task assigned to the winner ({ok[0]['name'] if ok else '-'})", {"status": t["status"], "rider": t["rider"]})
    check(statuses == ["ACCEPTED", "TAKEN", "TAKEN"], f"run {run}: offers ACCEPTED + 2 TAKEN", statuses)
    order = rows(must("GET", f"/orders/{oid}"))
    check(ok and order["riderName"] == ok[0]["name"], f"run {run}: order carries the winning rider", order.get("riderName"))
    for R, _ in lost:
        s, again = call("POST", f"/rider/offers/{offs[R['id']]}/accept", tok=R["tok"])
        if s != 409:
            check(False, f"run {run}: a loser's retry is still refused", (s, again))
            break
    if ok:
        wins[ok[0]["id"]] = wins.get(ok[0]["id"], 0) + 1
check(sum(wins.values()) == 5, "5 races, 5 single winners", {NAME[k]: v for k, v in wins.items()})

# ---------------------------------------------------------------- rejection / round handling
step("6. Rejections keep the round open; nobody left -> staff")
O6 = place_and_pack(6)
T6 = wait_for(lambda: task_of(O6))
offs6 = offered_round(T6["id"], 3)
must("POST", f"/rider/offers/{offs6[A['id']]}/reject", {"reason": "Too far"}, tok=A["tok"])
must("POST", f"/rider/offers/{offs6[B['id']]}/reject", {"reason": "Vehicle problem"}, tok=B["tok"])
t6 = must("GET", f"/delivery/tasks/{T6['id']}")
check(t6["status"] == "OFFERED" and len([x for x in t6["offers"] if x["status"] == "PENDING"]) == 1, "two rejected: still OFFERED, Chetan's offer still open (no new round yet)", [(x["rider"]["fullName"], x["status"]) for x in t6["offers"]])
must("POST", f"/rider/offers/{offs6[C['id']]}/reject", {"reason": "Ending my shift"}, tok=C["tok"])
t6 = wait_for(lambda: (lambda t: t if t["needsManualAssignment"] else None)(must("GET", f"/delivery/tasks/{T6['id']}")), timeout=10)
check(t6 and t6["status"] == "READY_FOR_PICKUP" and t6["needsManualAssignment"] and not [x for x in t6["offers"] if x["status"] == "PENDING"],
      "all eligible riders said no -> waiting on staff, no further offers", t6 and {"status": t6["status"], "needs": t6["needsManualAssignment"]})
check(t6 and any(e["type"] == "NEEDS_ASSIGNMENT" for e in t6["events"]), "timeline records that it needs a rider")

step("7. An unanswered round times out and moves to the next riders")
must("PATCH", "/delivery/settings", {"broadcastSize": 2, "offerTimeoutSeconds": 10})
O7 = place_and_pack(7)
T7 = wait_for(lambda: task_of(O7))
r1 = offered_round(T7["id"], 2)
check(r1 is not None and len(r1) == 2 and set(r1) <= TOP3, "round 1: two riders", {NAME.get(k, k) for k in (r1 or {})})
r2 = wait_for(lambda: (lambda p: p if p and p[0]["round"] == 2 else None)(pending_offers(T7["id"])), timeout=30)
third = (TOP3 - set(r1 or {}))
check(r2 is not None and len(r2) == 1 and r2[0]["rider"]["fullName"] == NAME[next(iter(third))] if third else False,
      "after 10 s with no answer, round 2 goes to the rider not yet asked", [(x["rider"]["fullName"], x["round"]) for x in (r2 or [])])
t7 = must("GET", f"/delivery/tasks/{T7['id']}")
check(sorted(x["status"] for x in t7["offers"] if x["round"] == 1) == ["EXPIRED", "EXPIRED"], "round 1 offers closed as EXPIRED", [(x["round"], x["status"]) for x in t7["offers"]])
must("PATCH", "/delivery/settings", {"broadcastSize": 3, "offerTimeoutSeconds": 120})

# ---------------------------------------------------------------- staff override
step("8. Staff override: pause auto-offer, assign a rider the dispatcher would skip")
paused = must("POST", f"/delivery/tasks/{T7['id']}/auto-dispatch", {"paused": True})
t7 = must("GET", f"/delivery/tasks/{T7['id']}")
check(paused["autoDispatchPaused"] and t7["status"] == "READY_FOR_PICKUP" and not [x for x in t7["offers"] if x["status"] == "PENDING"], "paused: open offer withdrawn, task waits for staff",
      [(x["rider"]["fullName"], x["status"]) for x in t7["offers"]])
check(any(x["status"] == "WITHDRAWN" for x in t7["offers"]), "the withdrawn offer is recorded as WITHDRAWN")
time.sleep(7)  # longer than the 5 s sweep
check(not pending_offers(T7["id"]), "the sweep does not re-offer a paused task")
s, _ = call("POST", f"/rider/offers/{r2[0]['id']}/accept", tok=next(R for R in (A, B, C) if R["name"] == r2[0]["rider"]["fullName"])["tok"]) if r2 else (None, None)
check(s == 409, "the withdrawn offer can no longer be accepted", s)
before = len(must("GET", "/rider/notifications", tok=D["tok"]))
asg = must("POST", f"/delivery/tasks/{T7['id']}/assign", {"riderId": D["id"]})
check(asg["status"] == "ASSIGNED" and asg["riderId"] == D["id"], "staff assigned the bicycle rider anyway (override)", {k: asg[k] for k in ("status", "riderId")})
notes = must("GET", "/rider/notifications", tok=D["tok"])
check(len(notes) == before + 1 and notes[0]["type"] == "TASK_ASSIGNED", "the rider got an 'assigned to you' notification", notes[:1])
s, bad = call("POST", f"/delivery/tasks/{T7['id']}/auto-dispatch", {"paused": False})
check(s == 400, "auto/manual cannot be switched once a rider has it", bad)

O8 = place_and_pack(8)
T8 = wait_for(lambda: task_of(O8))
offered_round(T8["id"], 3)
must("POST", f"/delivery/tasks/{T8['id']}/auto-dispatch", {"paused": True})
check(not pending_offers(T8["id"]), "second task paused")
must("POST", f"/delivery/tasks/{T8['id']}/auto-dispatch", {"paused": False})
r8 = offered_round(T8["id"], 3)
check(r8 is not None and set(r8) == TOP3, "resumed: offered to the riders again (fresh round)", {NAME.get(k, k) for k in (r8 or {})})

# ---------------------------------------------------------------- order limit
step("9. A rider at their order limit is not offered more")
held = len([t for t in rows(must("GET", f"/delivery/tasks?riderId={A['id']}")) if t["status"] in ("ASSIGNED", "AT_PICKUP", "PICKED_UP", "OUT_FOR_DELIVERY", "AT_DROP", "FAILED")])
pending_a = 1 if rider_offer(A, T8["id"]) else 0
must("PATCH", f"/riders/{A['id']}", {"maxActiveTasks": max(1, held)})
cand8 = must("GET", f"/delivery/tasks/{T8['id']}/candidates")
check(any(x["code"] == "AT_CAPACITY" for x in next(r for r in cand8["riders"] if r["id"] == A["id"])["reasons"]) if held >= 1 else True,
      f"Asha holds {held} with a limit of {max(1, held)} -> AT_CAPACITY on the next order", next(r for r in cand8["riders"] if r["id"] == A["id"]))
if pending_a:
    s, b = call("POST", f"/rider/offers/{r8[A['id']]}/accept", tok=A["tok"])
    check(s == 409 and b.get("code") == "AT_CAPACITY", "accepting while at the limit is refused (checked under the rider lock)", (s, b))
must("PATCH", f"/riders/{A['id']}", {"maxActiveTasks": 5})

# ---------------------------------------------------------------- outside driver vs app accept
step("10. Legacy 'assign rider' to an outside driver racing an app accept: one wins")
O9 = place_and_pack(9)
T9 = wait_for(lambda: task_of(O9))
offs9 = offered_round(T9["id"], 3)
res = race([
    lambda: call("POST", f"/rider/offers/{offs9[B['id']]}/accept", tok=B["tok"]),
    lambda: call("POST", f"/orders/{O9}/assign-rider", {"riderName": "Outside Driver", "riderPhone": "9000000001"}),
])
(sa, ba), (sx, bx) = res
rider_won, ext_won = sa in (200, 201), sx in (200, 201)
check(rider_won != ext_won, "exactly one of them succeeded", {"accept": (sa, ba), "assign-rider": (sx, bx)})
t9 = must("GET", f"/delivery/tasks/{T9['id']}")
order9 = rows(must("GET", f"/orders/{O9}"))
if rider_won:
    check(t9["status"] == "ASSIGNED" and t9["rider"]["id"] == B["id"] and order9["riderName"] == B["name"] and sx == 400, "the app rider won; the outside assignment was refused (400, as before)", {"task": t9["status"], "order": order9["riderName"], "assign": sx})
else:
    check(t9["status"] == "CANCELLED" and order9["riderName"] == "Outside Driver" and sa == 409, "the outside driver won; the app task closed and the accept was refused", {"task": t9["status"], "order": order9["riderName"], "accept": (sa, ba)})
check(not [x for x in t9["offers"] if x["status"] == "PENDING"], "no offer left open on that task", [(x["rider"]["fullName"], x["status"]) for x in t9["offers"]])

step("11. Going offline withdraws the rider from an open round")
O10 = place_and_pack(10)
T10 = wait_for(lambda: task_of(O10))
offs10 = offered_round(T10["id"], 3)
must("POST", "/rider/availability", {"online": False}, tok=C["tok"])
t10 = must("GET", f"/delivery/tasks/{T10['id']}")
c_offer = next(x for x in t10["offers"] if x["rider"]["fullName"] == C["name"])
check(c_offer["status"] == "REJECTED" and t10["status"] == "OFFERED", "Chetan went offline: his offer closed, the round continues with the others", (c_offer["status"], t10["status"]))
av = must("GET", f"/delivery/availability?warehouseId={WH_O}")
o = next(x for x in av["outlets"] if x["warehouseId"] == WH_O)
check(o["offline"] == 2, "availability now shows 2 offline", o)

print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILURE(S)'}")
raise SystemExit(1 if failures else 0)
