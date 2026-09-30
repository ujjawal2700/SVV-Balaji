#!/usr/bin/env python3
"""
End-to-end check of the POS counter against a RUNNING API.

  register a store (gets its own STORE warehouse) -> transfer QA-released stock
  from the central warehouse -> catalogue shows it -> no shift, no sale -> open
  shift (twice refused) -> cash sale with discount (server prices, GST, change,
  FIFO batches, stock + ledger down, GST invoice) -> retry with the same
  clientRequestId is the same sale -> overselling refused -> UPI sale to a GSTIN
  buyer (B2B invoice) -> concurrent sales on the last packs never oversell ->
  refund (stock back to its batches, invoice cancelled) -> shift expected cash
  and a short drawer -> reports -> outlet live figures -> delete refused,
  deactivate -> the batch sold at the counter traces back through /trace.

Sales and stock movements are permanent by design, so run this against a TEST
database. It needs QA-released stock in an active CENTRAL warehouse
(prisma/seed-storefront-stock.ts provides it). Everything it creates is stamped.

  BASE_URL=http://localhost:3001/api/v1 SEED_SUPER_ADMIN_PASSWORD=... python e2e-pos-flow.py
"""
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request

BASE = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
EMAIL = os.environ.get("SEED_SUPER_ADMIN_EMAIL", "admin@svvbalaji.com")
PASSWORD = os.environ.get("SEED_SUPER_ADMIN_PASSWORD", "admin@123")
STAMP = str(int(time.time()))[-6:]
failures = 0


def call(method, path, body=None, tok=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if tok:
        req.add_header("Authorization", f"Bearer {tok}")
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


def unwrap(b):
    return b["data"] if isinstance(b, dict) and set(b.keys()) == {"data"} else b


def step(t):
    print(f"\n==> {t}")


def check(ok, msg, detail=None):
    global failures
    if ok:
        print(f"  PASS {msg}")
    else:
        failures += 1
        print(f"  FAIL {msg}" + (f"\n       {json.dumps(detail, default=str)[:600]}" if detail is not None else ""))


def main():
    step("sign in")
    s, b = call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})
    check(s in (200, 201), "super admin signs in", b)
    tok = unwrap(b)["accessToken"]

    step("GST settings complete, so counter sales are invoiced")
    s, gst = call("GET", "/invoices/settings", tok=tok)
    if not gst.get("ready"):
        s, gst = call("PATCH", "/invoices/settings", {
            "legalName": "E2E Test Foods Pvt Ltd", "gstin": "27AAACS1234A1Z2", "addressLine1": "1 Test Road",
            "city": "Nagpur", "pincode": "440010"}, tok=tok)
    check(gst.get("ready") is True, "GST settings ready (seller in Maharashtra, 27)", gst)

    step("register a store")
    s, branches = call("GET", "/branches", tok=tok)
    branch_id = unwrap(branches)[0]["id"]
    code = f"E2E-{STAMP}"
    s, outlet = call("POST", "/pos/outlets", {
        "name": f"E2E Store {STAMP}", "code": code.lower(), "address": "Shop 4, Main Road", "city": "Nagpur",
        "state": "Maharashtra", "pincode": "440001", "managerName": "Test Manager", "posTerminalsCount": 2,
        "defaultOpeningCash": 1000, "branchId": branch_id}, tok=tok)
    check(s == 201 and outlet["code"] == code.upper(), "store created, code upper-cased", outlet)
    oid, wid = outlet["id"], outlet["warehouseId"]
    s, dup = call("POST", "/pos/outlets", {"name": "Dup", "code": code, "address": "x road", "city": "Nagpur", "state": "Maharashtra", "branchId": branch_id}, tok=tok)
    check(s == 409, "a second store with the same code is refused", dup)
    s, whs = call("GET", "/warehouses", tok=tok)
    store_wh = next((w for w in unwrap(whs) if w["id"] == wid), None)
    check(store_wh is not None and store_wh.get("kind") == "STORE", "its stock location is a STORE warehouse", store_wh)

    step("transfer QA-released stock from the central warehouse to the store")
    s, fgs = call("GET", "/finished-goods?qaReleased=true", tok=tok)
    s, stock_rows = call("GET", "/finished-goods-stock", tok=tok)
    central = [w for w in unwrap(whs) if w.get("kind") == "CENTRAL" and w.get("isActive")]
    if not central:
        print("  SKIP: no active CENTRAL warehouse with stock - run prisma/seed-storefront-stock.ts on this test DB")
        sys.exit(1)
    cid = central[0]["id"]
    rows = [r for r in unwrap(stock_rows) if r.get("warehouseId") == cid and int(r.get("quantity", 0)) - int(r.get("reservedQuantity", 0)) >= 10]
    check(len(rows) >= 2, "central holds at least two batches with free stock", len(rows))
    moved = []
    for r in rows[:2]:
        s, t = call("POST", f"/finished-goods/{r['fgBatchId']}/transfer", {"fromWarehouseId": cid, "toWarehouseId": wid, "quantity": 6}, tok=tok)
        check(s in (200, 201), f"6 packs of batch {r['fgBatchId'][:8]} moved to the store", t)
        moved.append(r["fgBatchId"])

    step("catalogue")
    s, cat = call("GET", f"/pos/outlets/{oid}/catalogue", tok=tok)
    sellable = [p for p in cat if p["availableStock"] > 0 and p["unitPrice"] is not None]
    check(len(sellable) >= 1, "catalogue lists priced products with store stock", cat[:3])
    p1 = sellable[0]
    check(p1["availableStock"] >= 6, f"{p1['name']}: {p1['availableStock']} packs sellable at the counter", p1)
    no_stock = [p for p in cat if p["availableStock"] == 0]
    check(all(cat.index(p) > cat.index(p1) for p in no_stock), "sellable products are listed first")

    step("no shift, no sale")
    sale_body = {"outletId": oid, "items": [{"productId": p1["id"], "quantity": 2}], "paymentMode": "CASH", "amountTendered": 100000}
    s, b = call("POST", "/pos/sales", sale_body, tok=tok)
    check(s == 400 and "shift" in str(b).lower(), "billing without an open shift is refused", b)

    step("open shift")
    s, shift = call("POST", "/pos/shifts", {"outletId": oid, "openingCash": 1000}, tok=tok)
    check(s == 201 and shift["shiftNumber"].startswith("SHIFT-"), "shift opened", shift)
    s, b = call("POST", "/pos/shifts", {"outletId": oid, "openingCash": 1000}, tok=tok)
    check(s == 409, "a second open shift for the same cashier is refused", b)

    step("cash sale with a counter discount")
    unit, rate = p1["unitPrice"], p1["gstRatePercent"]
    s, b = call("POST", "/pos/sales", {**sale_body, "amountTendered": 1}, tok=tok)
    check(s == 400 and "less than the bill" in str(b), "short cash refused", b)
    rid = f"e2e-{STAMP}-1"
    body1 = {**sale_body, "discount": 10, "amountTendered": 100000, "clientRequestId": rid,
             "customer": {"name": "Asha Rao", "phone": "9000000001"},
             # A price sent by the terminal must be ignored.
             "unitPrice": 1}
    s, sale1 = call("POST", "/pos/sales", body1, tok=tok)
    if s == 400 and "unitPrice" in str(sale1):
        body1.pop("unitPrice")
        check(True, "unknown fields (a client-sent price) are rejected outright")
        s, sale1 = call("POST", "/pos/sales", body1, tok=tok)
    check(s == 201 and sale1["saleNumber"].startswith("POS-"), "sale recorded", sale1)
    gross = round(unit * 2, 2)
    taxable = round(gross - 10, 2)
    tax = round(taxable * rate / 100, 2)
    total = round(taxable + tax, 2)
    check(abs(sale1["subtotal"] - gross) < 0.011 and abs(sale1["discountTotal"] - 10) < 0.001, "server price x qty, discount applied", sale1)
    check(abs(sale1["taxTotal"] - tax) < 0.02 and abs(sale1["total"] - total) < 0.02, f"GST on the discounted value ({tax}), total {total}", sale1)
    check(abs(sale1["changeDue"] - round(100000 - sale1["total"], 2)) < 0.001, "change computed", sale1)
    batches = sale1["lines"][0]["batches"]
    check(sum(x["quantity"] for x in batches) == 2 and all(x["fgBatchNumber"].startswith("FG-") for x in batches), "exact FG batches recorded on the line", batches)
    inv = sale1.get("invoice")
    check(inv is not None and inv["status"] == "ISSUED", "GST invoice issued for the counter sale", inv)
    if inv:
        s, full = call("GET", f"/invoices/{inv['id']}", tok=tok)
        check(full["supplyType"] == "B2C" and full["isInterState"] is False and full["placeOfSupply"] == "27", "B2C, intra-state at the store (CGST+SGST)", full)
        check(abs(full["grandTotal"] - sale1["total"]) < 0.001 and full.get("posSale", {}).get("saleNumber") == sale1["saleNumber"], "invoice total = sale total, linked to the sale", full)

    step("retry is idempotent")
    s, again = call("POST", "/pos/sales", body1, tok=tok)
    check(s == 201 and again["id"] == sale1["id"], "same clientRequestId returns the same sale", again)

    step("overselling refused")
    s, cat2 = call("GET", f"/pos/outlets/{oid}/catalogue", tok=tok)
    left = next(p for p in cat2 if p["id"] == p1["id"])["availableStock"]
    check(left == p1["availableStock"] - 2, f"stock went down by 2 (now {left})", left)
    s, b = call("POST", "/pos/sales", {**sale_body, "items": [{"productId": p1["id"], "quantity": left + 1}]}, tok=tok)
    check(s == 400 and "OUT_OF_STOCK" in str(b), "selling more than the store holds is refused", b)

    step("UPI sale to a GSTIN buyer")
    s, b = call("POST", "/pos/sales", {**sale_body, "paymentMode": "UPI", "customer": {"name": "Bad GSTIN Traders", "gstin": "27AAACS1234A1Z9"}}, tok=tok)
    check(s == 400 and "GSTIN" in str(b), "an invalid GSTIN is refused", b)
    s, sale2 = call("POST", "/pos/sales", {"outletId": oid, "items": [{"productId": p1["id"], "quantity": 1}], "paymentMode": "UPI",
                                          "paymentReference": "UPI123", "customer": {"type": "REGULAR_KIRANA", "name": "Hyderabad Traders", "gstin": "36AAACS1234A1Z3"}}, tok=tok)
    check(s == 201 and sale2["amountTendered"] is None, "UPI sale recorded, nothing tendered at the drawer", sale2)
    if sale2.get("invoice"):
        s, inv2 = call("GET", f"/invoices/{sale2['invoice']['id']}", tok=tok)
        check(inv2["supplyType"] == "B2B" and inv2["buyer"]["gstin"] == "36AAACS1234A1Z3", "B2B invoice carries the buyer GSTIN", inv2)

    step("two counters racing for the last packs never oversell")
    s, cat3 = call("GET", f"/pos/outlets/{oid}/catalogue", tok=tok)
    remaining = next(p for p in cat3 if p["id"] == p1["id"])["availableStock"]
    results = []

    def buy():
        results.append(call("POST", "/pos/sales", {"outletId": oid, "items": [{"productId": p1["id"], "quantity": remaining}], "paymentMode": "CARD"}, tok=tok))

    threads = [threading.Thread(target=buy) for _ in range(3)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    ok = [r for r in results if r[0] == 201]
    check(len(ok) == 1 and all(r[0] == 400 for r in results if r[0] != 201), f"exactly one of 3 concurrent sales of {remaining} packs succeeds", [r[0] for r in results])
    s, cat4 = call("GET", f"/pos/outlets/{oid}/catalogue", tok=tok)
    check(next(p for p in cat4 if p["id"] == p1["id"])["availableStock"] == 0, "store stock is exactly zero, never negative")

    step("refund")
    s, b = call("POST", f"/pos/sales/{sale1['id']}/refund", {"reason": "x"}, tok=tok)
    check(s == 400, "a refund needs a reason", b)
    s, ref = call("POST", f"/pos/sales/{sale1['id']}/refund", {"reason": "Customer returned sealed packs"}, tok=tok)
    check(s in (200, 201) and ref["status"] == "REFUNDED", "sale refunded", ref)
    check(ref.get("invoice") is None and all(i["status"] == "CANCELLED" for i in ref["invoices"]), "its invoice is cancelled", ref.get("invoices"))
    s, cat5 = call("GET", f"/pos/outlets/{oid}/catalogue", tok=tok)
    check(next(p for p in cat5 if p["id"] == p1["id"])["availableStock"] == 2, "the 2 packs are back in stock", cat5[:2])
    s, b = call("POST", f"/pos/sales/{sale1['id']}/refund", {"reason": "again please"}, tok=tok)
    check(s == 409, "refunding twice is refused", b)

    step("shift cash and reconciliation")
    s, mine = call("GET", f"/pos/shifts/mine?outletId={oid}", tok=tok)
    expected = round(1000 + sale1["total"] - sale1["total"], 2)
    check(abs(mine["expectedCash"] - expected) < 0.001, f"expected cash = opening + cash sale - cash refund = {expected}", mine)
    check(mine["salesCount"] == 3 and mine["refundsCount"] == 1, "3 sales and 1 refund in the shift", mine)
    s, closed = call("POST", f"/pos/shifts/{shift['id']}/close", {"countedCash": expected - 10, "notes": "10 short"}, tok=tok)
    check(s in (200, 201) and closed["status"] == "CLOSED" and float(closed["discrepancy"]) == -10, "closed with a ₹10 shortfall recorded", closed)
    s, b = call("POST", f"/pos/shifts/{shift['id']}/close", {"countedCash": 0}, tok=tok)
    check(s == 409, "closing twice is refused", b)
    s, b = call("POST", "/pos/sales", sale_body, tok=tok)
    check(s == 400, "no sales after the shift is closed", b)

    step("reports")
    s, rep = call("GET", f"/pos/reports?outletId={oid}", tok=tok)
    net = round(sale2["total"] + ok[0][1]["total"], 2)
    check(rep["totals"]["salesCount"] == 2 and abs(rep["totals"]["netSales"] - net) < 0.001, f"net sales today = the two unrefunded bills ({net})", rep["totals"])
    check(rep["totals"]["refundsCount"] == 1 and abs(rep["totals"]["refundsAmount"] - sale1["total"]) < 0.001, "the refund is reported on its own", rep["totals"])
    check(abs(rep["byMode"]["UPI"]["total"] - sale2["total"]) < 0.001 and rep["byMode"]["CASH"]["count"] == 0, "payment split by mode", rep["byMode"])
    check(len(rep["topItems"]) >= 1 and rep["topItems"][0]["productId"] == p1["id"], "top items", rep["topItems"])
    s, shifts = call("GET", f"/pos/shifts?outletId={oid}", tok=tok)
    check(len(shifts) == 1 and float(shifts[0]["discrepancy"]) == -10, "shift list shows the reconciliation", shifts)
    s, sales = call("GET", f"/pos/sales?outletId={oid}&limit=2", tok=tok)
    check(sales["meta"]["total"] == 3 and len(sales["data"]) == 2, "sales list pages (3 total, 2 per page)", sales["meta"])

    step("outlet live figures")
    s, det = call("GET", f"/pos/outlets/{oid}", tok=tok)
    check(det["counterStatus"] == "CLOSED" and det["lastReconciliation"]["status"] == "DISCREPANCY", "counter closed, last reconciliation shows the discrepancy", det)
    check(abs(det["today"]["total"] - net) < 0.001, "today's sales on the outlet match the report", det["today"])
    check(det["stock"]["packs"] == sum(i["packs"] for i in det["inventory"]) and len(det["inventory"]) >= 1, "stock totals come from the inventory rows", det["stock"])

    step("delete refused, deactivate allowed")
    s, b = call("DELETE", f"/pos/outlets/{oid}", tok=tok)
    check(s == 409 and "Deactivate" in str(b), "a store that traded cannot be deleted", b)
    s, b = call("PATCH", f"/pos/outlets/{oid}/status", {"isActive": False}, tok=tok)
    check(s == 200 and b["isActive"] is False, "store deactivated", b)
    s, b = call("POST", "/pos/shifts", {"outletId": oid, "openingCash": 0}, tok=tok)
    check(s == 400, "no shift can be opened at a deactivated store", b)
    s, lst = call("GET", "/pos/outlets", tok=tok)
    check(all(o["id"] != oid for o in lst), "deactivated stores are hidden from the default list")

    step("a pack sold at the counter still traces back")
    fg = sale2["lines"][0]["batches"][0]["fgBatchNumber"]
    s, trace = call("GET", f"/trace/{fg}", tok=tok)
    check(s == 200, f"/trace/{fg} resolves", trace)

    step("empty store can be deleted, taking its stock location with it")
    s, empty = call("POST", "/pos/outlets", {"name": f"Empty {STAMP}", "code": f"E2X-{STAMP}", "address": "x road", "city": "Nagpur", "state": "Maharashtra", "branchId": branch_id}, tok=tok)
    s, b = call("DELETE", f"/pos/outlets/{empty['id']}", tok=tok)
    check(s == 200, "deleted", b)
    s, whs2 = call("GET", "/warehouses", tok=tok)
    check(all(w["id"] != empty["warehouseId"] for w in unwrap(whs2)), "its warehouse is gone too")

    print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
