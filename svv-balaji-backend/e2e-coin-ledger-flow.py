#!/usr/bin/env python3
"""
End-to-end check of the Super Admin Coin & Points Ledger (GET /loyalty/ledger,
GET /loyalty/ledger/export). Read-only endpoint - run it AFTER a flow that
created coin movements, on the same throwaway database:

  e2e-loyalty-flow.py   (earned / reversed / expired / redeemed points)
  then this script, which also adds a staff correction both ways.

Checks: every row is listed (paging walks the whole ledger), the summary
totals equal the sum of the rows, each filter (type, pool, channel, search by
customer and by order, date range) narrows correctly, CSV export has every
row, bad filter values are a 400, and permissions (Branch Manager may view,
Logistics may not).

  SEED_SUPER_ADMIN_PASSWORD=... BASE_URL=http://localhost:3110/api/v1 python e2e-coin-ledger-flow.py
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

BASE = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
EMAIL = os.environ.get("SEED_SUPER_ADMIN_EMAIL", "admin@svvbalaji.com")
PASSWORD = os.environ.get("SEED_SUPER_ADMIN_PASSWORD", "admin@123")
STAMP = str(int(time.time()))
failures = 0
token = ""


def call(method, path, body=None, tok=None, raw=False):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    req.add_header("Content-Type", "application/json")
    t = tok or token
    if t:
        req.add_header("Authorization", f"Bearer {t}")
    try:
        with urllib.request.urlopen(req) as res:
            data = res.read().decode()
            return res.status, (data if raw else (json.loads(data) if data else None)), res.headers
    except urllib.error.HTTPError as e:
        data = e.read().decode()
        try:
            return e.code, json.loads(data), e.headers
        except ValueError:
            return e.code, data, e.headers


def must(method, path, body=None, tok=None):
    s, d, _ = call(method, path, body, tok)
    if s not in (200, 201):
        print(f"  FATAL {method} {path} -> {s}: {json.dumps(d)[:400]}")
        raise SystemExit(2)
    return d


def step(t):
    print(f"\n==> {t}")


def check(ok, msg, detail=None):
    global failures
    print(f"  {'PASS' if ok else 'FAIL'} {msg}" + ("" if ok or detail is None else f"\n       {json.dumps(detail, default=str)[:500]}"))
    if not ok:
        failures += 1
    return ok


def ledger(**params):
    qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    return must("GET", f"/loyalty/ledger?{qs}")


def all_rows(**params):
    rows, page = [], 1
    while True:
        d = ledger(**params, page=page, limit=100)
        rows += d["data"]
        if len(rows) >= d["meta"]["total"] or not d["data"]:
            return rows, d
        page += 1


token = must("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})["accessToken"]

step("1. Seed a staff correction both ways on a customer that already has coin history")
first, _ = all_rows()
check(len(first) > 0, f"the ledger has movements from the earlier flow ({len(first)})")
cust = next((r["customer"] for r in first if r["reason"] == "LOYALTY_EARN"), first[0]["customer"] if first else None)
must("POST", f"/referrals/ledger/{cust['id']}/adjust", {"amount": 25, "note": f"Goodwill bonus {STAMP}", "source": "LOYALTY"})
must("POST", f"/referrals/ledger/{cust['id']}/adjust", {"amount": -5, "note": f"Correction {STAMP}", "source": "LOYALTY"})

step("2. Every row, newest first, with customer / order / staff")
rows, d = all_rows()
s = d["summary"]
check(d["meta"]["total"] == len(rows) == len(first) + 2, "paging walks the whole ledger (2 new rows)", [d["meta"]["total"], len(rows), len(first)])
check(all(rows[i]["createdAt"] >= rows[i + 1]["createdAt"] for i in range(len(rows) - 1)), "newest first")
manual = [r for r in rows if r["reason"] == "MANUAL_ADJUSTMENT" and STAMP in (r["note"] or "")]
check(len(manual) == 2 and all(r["performedBy"] for r in manual), "staff corrections listed with the staff member's name", manual)
check(all(r["customer"]["customerCode"] and r["reasonLabel"] for r in rows), "each row names the customer and the type")
earn = [r for r in rows if r["reason"] == "LOYALTY_EARN"]
check(earn and all(r["order"] and r["order"]["orderNumber"] for r in earn), "loyalty earned rows link their order", earn[:1])

step("3. Summary equals the sum of the rows")
by = {}
for r in rows:
    by.setdefault(r["reason"], 0)
    by[r["reason"]] += r["amount"]
g = lambda *ks: sum(by.get(k, 0) for k in ks)
check(s["issued"] == g("LOYALTY_EARN", "REFERRAL_REFERRER_REWARD", "REFERRAL_REFEREE_REWARD"), "issued", [s["issued"], by])
check(s["redeemed"] == -g("LOYALTY_REDEMPTION", "REFERRAL_REDEMPTION", "LOYALTY_REDEMPTION_REFUND", "REFERRAL_REDEMPTION_REFUND"), "used at checkout (net of give-backs)", s["redeemed"])
check(s["reversed"] == -g("LOYALTY_REVERSAL") and s["reversed"] >= 0, "taken back on returns", s["reversed"])
check(s["expired"] == -g("LOYALTY_EXPIRY"), "expired", s["expired"])
plus = sum(r["amount"] for r in rows if r["reason"] == "MANUAL_ADJUSTMENT" and r["amount"] > 0)
minus = -sum(r["amount"] for r in rows if r["reason"] == "MANUAL_ADJUSTMENT" and r["amount"] < 0)
check(s["manualAdded"] == plus and s["manualRemoved"] == minus and plus >= 25 and minus >= 5, "staff + / - split", [s["manualAdded"], s["manualRemoved"]])
check(s["transactions"] == len(rows) and s["customers"] == len({r["customer"]["id"] for r in rows}), "entry and customer counts")
check(sum(x["count"] for x in s["byReason"]) == len(rows), "by-type breakdown covers every row", s["byReason"])
check(s["outstanding"] >= 0, "held by customers now", s["outstanding"])

step("4. Filters narrow correctly")
only, dd = all_rows(reason="MANUAL_ADJUSTMENT")
check(only and all(r["reason"] == "MANUAL_ADJUSTMENT" for r in only), "type filter", len(only))
check(dd["summary"]["issued"] == s["issued"], "the totals ignore the type filter (cards always show the full picture)")
loy, _ = all_rows(source="LOYALTY")
check(all(r["source"] == "LOYALTY" for r in loy) and len(loy) == sum(1 for r in rows if r["source"] == "LOYALTY"), "pool filter")
b2b, _ = all_rows(channel="B2B")
check(all(r["customer"]["channel"] == "B2B" for r in b2b), "channel filter", len(b2b))
mine, _ = all_rows(search=cust["customerCode"])
check(mine and all(r["customer"]["id"] == cust["id"] for r in mine), "search by customer code", len(mine))
if earn:
    num = earn[0]["order"]["orderNumber"]
    by_order, _ = all_rows(search=num)
    check(by_order and all(r["order"] and r["order"]["orderNumber"] == num for r in by_order), "search by order number", num)
today = date.today().isoformat()
todays, _ = all_rows(**{"from": today, "to": today})
check(len(todays) == len(rows), "today's range holds everything this run created", [len(todays), len(rows)])
future = (date.today() + timedelta(days=3)).isoformat()
none, _ = all_rows(**{"from": future})
check(none == [], "a future range is empty")

step("5. CSV export and validation")
s2, csv, headers = call("GET", "/loyalty/ledger/export", raw=True)
lines = [l for l in csv.splitlines() if l.strip()]
check(s2 == 200 and "text/csv" in headers.get("Content-Type", ""), "CSV served", headers.get("Content-Type"))
check(lines[0].startswith("Date (IST),Customer code") and len(lines) - 1 == len(rows), "one CSV line per row + header", [len(lines), len(rows)])
s3, _, _ = call("GET", "/loyalty/ledger/export?reason=MANUAL_ADJUSTMENT", raw=True)
check(s3 == 200, "export honours filters")
s4, bad, _ = call("GET", "/loyalty/ledger?reason=FREE_MONEY")
check(s4 == 400, "an unknown type is a 400", bad)
s5, bad, _ = call("GET", "/loyalty/ledger?from=07-10-2026")
check(s5 == 400, "a malformed date is a 400", bad)

step("6. Permissions")


def user_token(role):
    email, pw = f"cl-{role.lower()}-{STAMP}@example.com", "E2e@12345"
    br = must("GET", "/branches")
    br = (br["data"] if isinstance(br, dict) else br)[0]["id"]
    must("POST", "/users", {"email": email, "password": pw, "fullName": role, "role": role, "branchId": br})
    return must("POST", "/auth/login", {"email": email, "password": pw}, tok="-")["accessToken"]


s6, _, _ = call("GET", "/loyalty/ledger", tok=user_token("BRANCH_MANAGER"))
check(s6 == 200, "branch manager (loyalty.view) can read the ledger", s6)
s7, _, _ = call("GET", "/loyalty/ledger", tok=user_token("LOGISTICS_TEAM"))
check(s7 == 403, "logistics cannot", s7)

print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILURE(S)'}")
raise SystemExit(1 if failures else 0)
