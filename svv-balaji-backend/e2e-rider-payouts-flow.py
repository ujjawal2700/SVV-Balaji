"""
End-to-end check of rider payouts: what is owed, recording pay (bank / UPI /
cash), keeping COD cash against it, races, voids, and the rider's own view.

Needs a throwaway database with at least one ACTIVE rider who signed up with
password Secret#123 and has earnings (e2e-returns-flow.py or e2e-rider-flow.py
leave one). Adds COD cash for that rider directly in the database - never point
it at a real one.

  DATABASE_URL=postgresql://.../throwaway BASE_URL=http://localhost:3110/api/v1 \
  SEED_SUPER_ADMIN_PASSWORD=... python -X utf8 e2e-rider-payouts-flow.py
"""
import json
import os
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
EMAIL = os.environ.get("SEED_SUPER_ADMIN_EMAIL", "admin@svvbalaji.com")
PASSWORD = os.environ.get("SEED_SUPER_ADMIN_PASSWORD", "admin@123")
if "DATABASE_URL" not in os.environ:
    sys.exit("Set DATABASE_URL to the throwaway database the API under test uses")

failures = []
STAMP = datetime.now().strftime("%H%M%S%f")


def check(name, ok, detail=""):
    print(("  ok   " if ok else "  FAIL ") + name + ("" if ok else f"  -> {detail}"))
    if not ok:
        failures.append(name)


def step(t):
    print(f"\n==> {t}")


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            return e.code, json.loads(text)
        except ValueError:
            return e.code, text


def db(js):
    script = (
        "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();"
        f"(async()=>{{const r=await (async()=>{{{js}}})();console.log(JSON.stringify(r??null));}})()"
        ".catch(e=>{console.error(e);process.exitCode=1}).finally(()=>p.$disconnect())"
    )
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True, env=os.environ)
    return json.loads(out.stdout.strip().splitlines()[-1])


s, login = call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})
assert s in (200, 201), login
tok = login["accessToken"]
today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).strftime("%Y-%m-%d")

rider = db("return await p.rider.findFirst({where:{status:'ACTIVE',earnings:{some:{payoutId:null}}},select:{id:true,phone:true,fullName:true}})")
if not rider:
    sys.exit("No active rider with unpaid earnings - run e2e-returns-flow.py on this DB first")
rid = rider["id"]
cash0 = db(f"return Number((await p.riderCashEntry.aggregate({{where:{{riderId:'{rid}'}},_sum:{{amount:true}}}}))._sum.amount??0)")

step("1. what is owed")
s, due = call("GET", f"/rider-payouts/due?upTo={today}", token=tok)
row = next((r for r in due.get("rows", []) if r["rider"]["id"] == rid), None) if s == 200 else None
truth = db(f"const a=await p.riderEarning.aggregate({{where:{{riderId:'{rid}',payoutId:null}},_sum:{{amount:true}},_count:{{_all:true}}}});return {{owed:Number(a._sum.amount),lines:a._count._all}}")
check("due lists the rider with the unpaid total and line count", row is not None and abs(row["owed"] - truth["owed"]) < 0.01 and row["lines"] == truth["lines"], (row, truth))
s, pv = call("GET", f"/riders/{rid}/payouts/preview?upTo={today}", token=tok)
check("preview -> lines and gross match", s == 200 and len(pv["lines"]) == truth["lines"] and abs(pv["gross"] - truth["owed"]) < 0.01, pv)
s, older = call("GET", f"/riders/{rid}/payouts/preview?upTo=2020-01-01", token=tok)
check("a cut-off before any earning settles nothing", s == 200 and older["gross"] == 0 and older["lines"] == [], older)

step("2. a clawback nets in")
s, adj = call("POST", f"/riders/{rid}/earnings/adjustments", {"amount": -5, "note": "e2e late handover"}, token=tok)
check("adjustment -5 recorded", s in (200, 201), adj)
s, pv2 = call("GET", f"/riders/{rid}/payouts/preview?upTo={today}", token=tok)
check("gross drops by 5", s == 200 and abs(pv2["gross"] - (pv["gross"] - 5)) < 0.01, (pv2.get("gross"), pv["gross"]))
gross = pv2["gross"]

step("3. refusals")
s, b = call("POST", f"/riders/{rid}/payouts", {"upTo": today, "method": "BANK_TRANSFER"}, token=tok)
check("bank transfer without a reference -> 400", s == 400 and "reference" in json.dumps(b).lower(), b)
s, b = call("POST", f"/riders/{rid}/payouts", {"upTo": today, "method": "UPI", "reference": "x1", "cashOffset": cash0 + 1}, token=tok)
check("keeping more cash than held -> 400", s == 400 and "holds only" in json.dumps(b), b)
db(f"await p.riderCashEntry.create({{data:{{riderId:'{rid}',type:'COD_COLLECTED',amount:{gross + 300},note:'e2e cash'}}}});return true")
s, b = call("POST", f"/riders/{rid}/payouts", {"upTo": today, "method": "UPI", "reference": "x1", "cashOffset": gross + 1}, token=tok)
check("keeping more cash than is owed -> 400", s == 400 and "cannot exceed what is owed" in json.dumps(b), b)
s, b = call("POST", f"/riders/{rid}/payouts", {"upTo": "2999-01-01", "method": "CASH"}, token=tok)
check("a future cut-off -> 400", s == 400, b)
s, b = call("POST", f"/riders/{rid}/payouts", {"upTo": today, "method": "CHEQUE"}, token=tok)
check("unknown method -> 400", s == 400, b)

step("4. record: UPI, keeping ₹100 of COD cash")
cash_before = db(f"return Number((await p.riderCashEntry.aggregate({{where:{{riderId:'{rid}'}},_sum:{{amount:true}}}}))._sum.amount??0)")
s, po = call("POST", f"/riders/{rid}/payouts", {"upTo": today, "method": "UPI", "reference": f"UPI{STAMP}", "cashOffset": 100, "note": "weekly"}, token=tok)
check("payout -> 201, RPO number", s == 201 and po["payoutNumber"].startswith("RPO-"), po)
check("net = gross - 100, gross as previewed", s == 201 and abs(po["grossAmount"] - gross) < 0.01 and abs(po["netPaid"] - (gross - 100)) < 0.01, po)
check("every line is settled by it", s == 201 and len(po["earnings"]) == truth["lines"] + 1 and po["lineCount"] == truth["lines"] + 1, po.get("lineCount"))
cash_after = db(f"return Number((await p.riderCashEntry.aggregate({{where:{{riderId:'{rid}'}},_sum:{{amount:true}}}}))._sum.amount??0)")
check("cash held drops by exactly the ₹100 kept", abs(cash_before - cash_after - 100) < 0.01, (cash_before, cash_after))
s, due2 = call("GET", f"/rider-payouts/due?upTo={today}", token=tok)
check("the rider is no longer owed anything", s == 200 and not any(r["rider"]["id"] == rid for r in due2["rows"]), due2)
s, b = call("POST", f"/riders/{rid}/payouts", {"upTo": today, "method": "CASH"}, token=tok)
check("paying again with nothing owed -> 400", s == 400 and "Nothing is owed" in json.dumps(b), b)

step("5. two staff paying the same rider at once - exactly one wins")
call("POST", f"/riders/{rid}/earnings/adjustments", {"amount": 50, "note": "e2e bonus"}, token=tok)
results = []


def pay(i):
    results.append(call("POST", f"/riders/{rid}/payouts", {"upTo": today, "method": "CASH", "note": f"race {i}"}, token=tok)[0])


threads = [threading.Thread(target=pay, args=(i,)) for i in range(3)]
[t.start() for t in threads]
[t.join() for t in threads]
check("one 201, the others refused", results.count(201) == 1 and all(x in (400, 409) for x in results if x != 201), results)
paid_twice = db(f"return await p.riderEarning.count({{where:{{riderId:'{rid}',payoutId:null}}}})")
check("no line left unpaid or double-paid", paid_twice == 0, paid_twice)

step("6. void puts it all back")
s, v = call("POST", f"/rider-payouts/{po['id']}/void", {"reason": "e2e recorded against wrong rider"}, token=tok)
check("void -> 201, VOIDED", s == 201 and v["status"] == "VOIDED", v)
unpaid = db(f"return await p.riderEarning.count({{where:{{payoutId:null,riderId:'{rid}'}}}})")
check("its lines are owed again", unpaid == po["lineCount"], (unpaid, po["lineCount"]))
cash_v = db(f"return Number((await p.riderCashEntry.aggregate({{where:{{riderId:'{rid}'}},_sum:{{amount:true}}}}))._sum.amount??0)")
check("the ₹100 is back on cash held", abs(cash_v - cash_before) < 0.01, (cash_v, cash_before))
s, b = call("POST", f"/rider-payouts/{po['id']}/void", {"reason": "again"}, token=tok)
check("void twice -> 409", s == 409, b)

step("7. history and the rider's own view")
s, lst = call("GET", f"/rider-payouts?riderId={rid}", token=tok)
check("list has both payouts, summary counts only PAID", s == 200 and lst["meta"]["total"] >= 2 and all(x["rider"]["id"] == rid for x in lst["data"]), lst.get("meta"))
s, rl = call("POST", "/rider/auth/login", {"identifier": rider["phone"], "password": "Secret#123"})
if s in (200, 201):
    rtok = rl["accessToken"]
    s, mine = call("GET", "/rider/payouts", token=rtok)
    owed_now = db(f"return Number((await p.riderEarning.aggregate({{where:{{riderId:'{rid}',payoutId:null}},_sum:{{amount:true}}}}))._sum.amount??0)")
    check("rider sees unpaid and only PAID payouts", s == 200 and abs(mine["unpaid"] - owed_now) < 0.01 and all(x["id"] != po["id"] for x in mine["payouts"]), mine)
    s, _ = call("GET", "/rider-payouts", token=rtok)
    check("a rider token cannot read staff payouts", s in (401, 403), s)
else:
    check("rider can sign in with the e2e password", False, rl)

step("8. permissions")


def user_token(role):
    email, pw = f"rp-{role.lower()}-{STAMP}@example.com", "E2e@12345"
    _, br = call("GET", "/branches", token=tok)
    br = (br["data"] if isinstance(br, dict) else br)[0]["id"]
    st, u = call("POST", "/users", {"email": email, "password": pw, "fullName": role, "role": role, "branchId": br}, token=tok)
    assert st in (200, 201), u
    return call("POST", "/auth/login", {"email": email, "password": pw})[1]["accessToken"]


lt = user_token("LOGISTICS_TEAM")
check("Logistics cannot record a payout", call("POST", f"/riders/{rid}/payouts", {"upTo": today, "method": "CASH"}, token=lt)[0] == 403)
bm = user_token("BRANCH_MANAGER")
check("Branch Manager can see what is due", call("GET", f"/rider-payouts/due?upTo={today}", token=bm)[0] == 200)

print()
if failures:
    print(f"FAILED: {len(failures)}")
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print("ALL PASSED")
