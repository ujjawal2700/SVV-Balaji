#!/usr/bin/env python3
"""
End-to-end check of B2B credit receivables against a RUNNING API (mock OTP).

  retailer on Net 15 with a limit -> credit bills (overdue, not yet dispatched, legacy
  marked-paid) -> due dates + ageing + statement -> record a payment (oldest due first,
  PARTIAL / PAID) -> credit headroom everywhere agrees -> guards (overpay, future date,
  manual PAID on a credit bill, cancel with payments applied) -> credit period start
  setting -> retailer's own statement over the storefront API -> void (everything
  reverts) -> cleanup.

Orders are inserted directly (placing real ones needs stock); everything else goes
through the API. Creates its own stamped data and removes it; safe to re-run.

  SEED_SUPER_ADMIN_PASSWORD=... python e2e-receivables-flow.py
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta

BASE = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
EMAIL = os.environ.get("SEED_SUPER_ADMIN_EMAIL", "admin@svvbalaji.com")
PASSWORD = os.environ.get("SEED_SUPER_ADMIN_PASSWORD", "admin@123")
STAMP = str(int(time.time()))
HERE = os.path.dirname(os.path.abspath(__file__))
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


def must(method, path, body=None, tok=None, expect=(200, 201)):
    s, d = call(method, path, body, tok)
    if s not in expect:
        print(f"  FATAL {method} {path} -> {s}: {json.dumps(d)[:300]}")
        raise SystemExit(2)
    return d


def node(js):
    """Run a Prisma snippet in the backend; `p` is the client. Prints JSON of the result."""
    wrapped = (
        "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();"
        f"(async()=>{{const r=await (async()=>{{{js}}})();console.log(JSON.stringify(r??null));}})()"
        ".catch(e=>{console.error(e);process.exitCode=1}).finally(()=>p.$disconnect())"
    )
    out = subprocess.run(["node", "-e", wrapped], cwd=HERE, check=True, capture_output=True, text=True)
    return json.loads(out.stdout.strip().splitlines()[-1])


def days_ago(n):
    return (date.today() - timedelta(days=n)).isoformat() + "T10:00:00.000Z"


def iso_day(n_ago):
    return (date.today() - timedelta(days=n_ago)).isoformat()


admin = must("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})["accessToken"]
customer_id = None
orig_start = None

try:
    # -------------------------------------------------------------------------
    step("1. A retailer on Net 15 with a 1,00,000 limit, and four credit bills")
    gstin = f"29ABCDE{STAMP[-4:]}F1Z5"
    phone = f"8{STAMP[-6:]}777"
    cust = must("POST", "/customers", {
        "channel": "B2B", "type": "RETAILER", "name": f"E2E Credit Store {STAMP}", "phone": phone,
        "gstin": gstin, "billingAddress": "1 Test Road, Hubli", "paymentTerms": "CREDIT_15", "creditLimit": 100000,
    }, tok=admin)
    customer_id = cust["id"]
    wh = node("return (await p.warehouse.findFirst({select:{id:true}})).id")

    def order(tag, total, status, order_ago, dispatched_ago=None, paid=None):
        disp = f"new Date('{days_ago(dispatched_ago)}')" if dispatched_ago is not None else "null"
        return node(
            "return (await p.order.create({data:{"
            f"orderNumber:'E2E-RCV-{STAMP}-{tag}',channel:'B2B',customerId:'{customer_id}',status:'{status}',"
            f"orderDate:new Date('{days_ago(order_ago)}'),warehouseId:'{wh}',subtotal:{total},taxTotal:0,total:{total},"
            f"paymentTerms:'CREDIT_15',paymentStatus:'{paid or 'PENDING'}',dispatchedAt:{disp}"
            "}})).id"
        )

    A = order("A", 30000, "DISPATCHED", 40, 38)  # due 23 days ago -> 1-30 overdue
    B = order("B", 20000, "DELIVERED", 72, 70)   # due 55 days ago -> 31-60 overdue
    C = order("C", 10000, "CONFIRMED", 5)        # not dispatched -> no due date yet
    D = order("D", 5000, "DELIVERED", 90, 88, paid="PAID")  # marked paid before receipts existed

    # -------------------------------------------------------------------------
    step("2. Account: due dates, ageing, statement")
    acct = must("GET", f"/receivables/customers/{customer_id}", tok=admin)
    sm = acct["summary"]
    check(sm["outstanding"] == 60000, "outstanding = 30000 + 20000 + 10000 (the legacy PAID bill is settled)", sm)
    check(sm["overdue"] == 50000 and sm["overdueBills"] == 2, "overdue = the two dispatched bills past Net 15", sm)
    check(sm["availableCredit"] == 40000, "available credit = limit - outstanding", sm)
    check(acct["ageing"] == {"NOT_DUE": 10000, "D1_30": 30000, "D31_60": 20000, "D61_90": 0, "D90_PLUS": 0}, "ageing buckets", acct["ageing"])
    bills = {b["orderNumber"][-1]: b for b in acct["openBills"]}
    check(bills["A"]["dueDate"][:10] == iso_day(23) and bills["A"]["overdueDays"] == 23, "A due 15 days after dispatch, 23 days overdue", bills["A"])
    check(bills["C"]["dueDate"] is None and "dispatched" in (bills["C"]["dueNote"] or ""), "C has no due date until it is dispatched", bills["C"])
    st = acct["statement"]
    check(st["closingBalance"] == 60000 and st["totals"]["debit"] == 65000 and st["totals"]["credit"] == 5000,
          "statement: 65000 billed, the legacy paid bill credited, closing 60000", st["totals"])
    check(any("before receipts" in l["description"] for l in st["lines"]), "legacy paid bill shows as settled on the statement")

    s, credit = call("GET", f"/customers/{customer_id}/credit", tok=admin)
    check(s == 200 and credit["outstanding"] == 60000 and credit["availableCredit"] == 40000,
          "customer credit position sends `outstanding` (the admin tile used to read 0)", credit)

    lst = must("GET", "/receivables?overdueOnly=true", tok=admin)
    row = next((r for r in lst["customers"] if r["customerId"] == customer_id), None)
    check(row is not None and row["overdue"] == 50000 and row["oldestOverdueDays"] == 55, "receivables list: overdue customer, oldest 55 days", row)

    # -------------------------------------------------------------------------
    step("3. Record a payment: oldest due first")
    s, rc = call("POST", f"/receivables/customers/{customer_id}/receipts",
                 {"amount": 25000, "method": "UPI", "reference": f"UTR{STAMP}", "receivedOn": iso_day(0)}, tok=admin)
    check(s == 201 and rc["receiptNumber"].startswith("RCPT-"), "receipt numbered RCPT-YYYYMMDD-NNN", rc)
    applied = {a["orderNumber"][-1]: a["amount"] for a in (rc or {}).get("appliedTo", [])}
    check(applied == {"B": 20000, "A": 5000}, "20000 clears B (due first), 5000 goes to A", applied)
    states = node(f"return p.order.findMany({{where:{{id:{{in:['{A}','{B}']}}}},select:{{orderNumber:true,paymentStatus:true,amountPaid:true}},orderBy:{{orderNumber:'asc'}}}})")
    check([(o["paymentStatus"], float(o["amountPaid"])) for o in states] == [("PARTIAL", 5000.0), ("PAID", 20000.0)],
          "A PARTIAL (5000 paid), B PAID", states)

    acct = must("GET", f"/receivables/customers/{customer_id}", tok=admin)
    check(acct["summary"]["outstanding"] == 35000 and acct["summary"]["overdue"] == 25000, "outstanding 35000, overdue 25000", acct["summary"])
    check(acct["statement"]["closingBalance"] == 35000, "statement closing balance follows the receipt")
    credit = must("GET", f"/customers/{customer_id}/credit", tok=admin)
    check(credit["outstanding"] == 35000, "credit position counts only the unpaid part of A", credit)

    # -------------------------------------------------------------------------
    step("4. Guards")
    s, r = call("POST", f"/receivables/customers/{customer_id}/receipts", {"amount": 35000.01, "method": "CASH", "receivedOn": iso_day(0)}, tok=admin)
    check(s == 400 and "more than" in json.dumps(r), "refuses a payment larger than what is owed", r)
    s, r = call("POST", f"/receivables/customers/{customer_id}/receipts", {"amount": 100, "method": "CASH", "receivedOn": iso_day(-5)}, tok=admin)
    check(s == 400, "refuses a received date in the future", r)
    s, r = call("PATCH", f"/orders/{A}/payment-status", {"paymentStatus": "PAID"}, tok=admin)
    check(s == 400 and "Receivables" in json.dumps(r), "manual PAID on a credit bill is refused (use Receivables)", r)
    # 30000 clears the rest of A (25000) and puts 5000 on C, which is still cancellable (CONFIRMED).
    rc2 = must("POST", f"/receivables/customers/{customer_id}/receipts", {"amount": 30000, "method": "CHEQUE", "receivedOn": iso_day(0)}, tok=admin)
    check({a["orderNumber"][-1]: a["amount"] for a in rc2["appliedTo"]} == {"A": 25000, "C": 5000}, "second payment finishes A, then C", rc2)
    s, r = call("PATCH", f"/orders/{C}/cancel", {"reason": "e2e"}, tok=admin)
    check(s == 400 and "Void" in json.dumps(r), "cancelling a bill with payments applied is refused", r)
    must("POST", f"/receivables/receipts/{rc2['id']}/void", {"reason": "e2e: undo second payment"}, tok=admin)
    check(must("GET", f"/receivables/customers/{customer_id}", tok=admin)["summary"]["outstanding"] == 35000, "voiding it puts 35000 back")

    # -------------------------------------------------------------------------
    step("5. Credit period start is a setting")
    orig_start = must("GET", "/checkout-settings", tok=admin)["creditPeriodStart"]
    check(orig_start == "DISPATCH", "default is DISPATCH")
    must("PATCH", "/checkout-settings", {"creditPeriodStart": "ORDER_DATE"}, tok=admin)
    acct = must("GET", f"/receivables/customers/{customer_id}", tok=admin)
    c_bill = next(b for b in acct["openBills"] if b["orderNumber"].endswith("-C"))
    check(c_bill["dueDate"] and c_bill["dueDate"][:10] == iso_day(-10), "under ORDER_DATE, C is due 15 days after it was ordered", c_bill)
    must("PATCH", "/checkout-settings", {"creditPeriodStart": orig_start}, tok=admin)
    orig_start = None

    # -------------------------------------------------------------------------
    step("6. The retailer sees their own statement")
    s, o = call("POST", "/storefront/auth/otp/request", {"phone": phone, "audience": "RETAILER"})
    s, sess = call("POST", "/storefront/auth/otp/verify", {"phone": phone, "code": o.get("devCode"), "audience": "RETAILER"})
    check(s == 200, "retailer signs in", sess)
    tok = sess["accessToken"]
    mine = must("GET", "/storefront/credit", tok=tok)
    check(mine["summary"]["outstanding"] == 35000 and len(mine["openBills"]) == 2, "own outstanding and open bills", mine["summary"])
    check(all("recordedBy" not in r for r in mine["receipts"]), "staff names are not exposed to the retailer")
    me = must("GET", "/storefront/auth/me", tok=tok)
    check(me.get("creditUsed") == 35000 and me.get("paymentTerms") == "CREDIT_15" and me.get("creditLimit") == 100000,
          "/me: creditUsed matches, and carries the real terms", {k: me.get(k) for k in ("creditUsed", "paymentTerms", "creditLimit")})

    # -------------------------------------------------------------------------
    step("7. Void the receipt: everything reverts")
    s, v = call("POST", f"/receivables/receipts/{rc['id']}/void", {"reason": "entered against the wrong customer"}, tok=admin)
    check(s == 201 and v["voidReason"], "receipt voided with a reason", v)
    states = node(f"return p.order.findMany({{where:{{id:{{in:['{A}','{B}']}}}},select:{{paymentStatus:true,amountPaid:true}},orderBy:{{orderNumber:'asc'}}}})")
    check([(o["paymentStatus"], float(o["amountPaid"])) for o in states] == [("PENDING", 0.0), ("PENDING", 0.0)], "A and B back to PENDING, nothing paid", states)
    acct = must("GET", f"/receivables/customers/{customer_id}", tok=admin)
    check(acct["summary"]["outstanding"] == 60000 and acct["statement"]["closingBalance"] == 60000, "outstanding and statement back to 60000")
    check(acct["receipts"][0]["voided"] is True, "the voided receipt stays in the history")
    s, r = call("POST", f"/receivables/receipts/{rc['id']}/void", {"reason": "again"}, tok=admin)
    check(s == 400, "cannot void twice", r)
finally:
    step("Cleanup")
    if orig_start:
        call("PATCH", "/checkout-settings", {"creditPeriodStart": orig_start}, tok=admin)
    if customer_id:
        node(
            f"const c='{customer_id}';"
            "await p.creditReceipt.deleteMany({where:{customerId:c}});"
            "await p.orderEvent.deleteMany({where:{order:{customerId:c}}}).catch(()=>{});"
            "await p.order.deleteMany({where:{customerId:c}});"
            "const a=await p.customerAccount.findUnique({where:{customerId:c}});"
            "if(a){await p.customerSession.deleteMany({where:{accountId:a.id}}).catch(()=>{});await p.customerAccount.delete({where:{id:a.id}});}"
            "await p.referral.deleteMany({where:{OR:[{refereeId:c},{referrerId:c}]}}).catch(()=>{});"
            "await p.customer.delete({where:{id:c}});"
            "return true"
        )
        print("  removed test customer, orders, receipts and login")

print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
sys.exit(1 if failures else 0)
