"""
End-to-end check of the report endpoints: GET /reports/sales, /reports/sales/export,
/reports/finance and /dashboard/commerce.

Run against a throwaway database that already has orders, POS sales and credit
receipts in it (e.g. after e2e-pos-flow.py, e2e-receivables-flow.py and
e2e-loyalty-flow.py on the same fresh DB). The script recomputes the headline
figures straight from the database and asserts the API agrees.

  DATABASE_URL=postgresql://.../throwaway BASE_URL=http://localhost:3110/api/v1 \
  SEED_SUPER_ADMIN_PASSWORD=... python -X utf8 e2e-reports-flow.py

DATABASE_URL must point at the same database as the API under test - the
cross-checks read it with Prisma.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
EMAIL = os.environ.get("SEED_SUPER_ADMIN_EMAIL", "admin@svvbalaji.com")
PASSWORD = os.environ.get("SEED_SUPER_ADMIN_PASSWORD", "admin@123")
if "DATABASE_URL" not in os.environ:
    sys.exit("Set DATABASE_URL to the throwaway database the API under test uses")

failures = []


def check(name, ok, detail=""):
    print(("  ok   " if ok else "  FAIL ") + name + ("" if ok else f"  -> {detail}"))
    if not ok:
        failures.append(name)


def call(method, path, body=None, token=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as r:
            payload = r.read()
            return r.status, (payload.decode() if raw else json.loads(payload or b"null"))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def db(js):
    """Run a Prisma snippet against DATABASE_URL and return its JSON result."""
    script = (
        "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();"
        f"(async()=>{{const r=await (async()=>{{{js}}})();console.log(JSON.stringify(r??null));}})()"
        ".catch(e=>{console.error(e);process.exitCode=1}).finally(()=>p.$disconnect())"
    )
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True, env=os.environ)
    return json.loads(out.stdout.strip().splitlines()[-1])


def ist_today():
    return (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()


status, login = call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})
assert status in (200, 201), login
token = login["accessToken"]

# A range wide enough to hold everything the earlier scripts created (they back-date orders).
to = ist_today()
frm = to - timedelta(days=364)
q = f"?from={frm}&to={to}"
start = f"{frm - timedelta(days=0)}T00:00:00+05:30"
end = f"{to + timedelta(days=1)}T00:00:00+05:30"

print("==> sales report")
status, s = call("GET", "/reports/sales" + q, token=token)
check("GET /reports/sales -> 200", status == 200, s)
truth = db(
    f"const w={{orderDate:{{gte:new Date('{start}'),lt:new Date('{end}')}},status:{{notIn:['DRAFT','CANCELLED']}}}};"
    "const o=await p.order.aggregate({where:w,_sum:{total:true},_count:{_all:true}});"
    f"const pos=await p.posSale.aggregate({{where:{{createdAt:{{gte:new Date('{start}'),lt:new Date('{end}')}},status:'COMPLETED'}},_sum:{{total:true}},_count:{{_all:true}}}});"
    "const c=await p.order.findMany({where:w,select:{customerId:true},distinct:['customerId']});"
    "return {orders:o._count._all,rev:Number(o._sum.total??0),pos:pos._count._all,posRev:Number(pos._sum.total??0),customers:c.length}"
)
k = s["kpis"]
check("orders = sold orders in DB", k["orders"] == truth["orders"], (k["orders"], truth))
check("POS sales = completed POS sales in DB", k["posSales"] == truth["pos"], (k["posSales"], truth))
check("revenue = order totals + POS totals", abs(k["revenue"] - (truth["rev"] + truth["posRev"])) < 0.01, (k["revenue"], truth))
check("customers = distinct ordering customers", k["customers"] == truth["customers"], (k["customers"], truth))
check("new + returning = customers", k["newCustomers"] + k["returningCustomers"] == k["customers"], k)
check("there is data to look at", k["orders"] + k["posSales"] > 0, k)
check("trend bars add up to revenue", abs(sum(t["total"] for t in s["trend"]) - k["revenue"]) < 0.05, sum(t["total"] for t in s["trend"]))
check("trend uses month buckets for a year", s["granularity"] == "month" and len(s["trend"]) >= 12, (s["granularity"], len(s["trend"])))
check("sources add up to revenue", abs(sum(x["revenue"] for x in s["bySource"]) - k["revenue"]) < 0.05, s["bySource"])
lines_total = db(
    f"const r={{gte:new Date('{start}'),lt:new Date('{end}')}};"
    "const a=await p.orderItem.aggregate({where:{order:{orderDate:r,status:{notIn:['DRAFT','CANCELLED']}}},_sum:{lineTotal:true}});"
    "const b=await p.posSaleLine.aggregate({where:{sale:{createdAt:r,status:'COMPLETED'}},_sum:{lineTotal:true}});"
    "return Number(a._sum.lineTotal??0)+Number(b._sum.lineTotal??0)"
)
check("categories add up to every sold line", abs(sum(x["revenue"] for x in s["byCategory"]) - lines_total) < 0.05, (sum(x["revenue"] for x in s["byCategory"]), lines_total))
check("regions add up to revenue (all fit in top 15)", len(s["byRegion"]) == 15 or abs(sum(x["revenue"] for x in s["byRegion"]) - k["revenue"]) < 0.05, s["byRegion"])
check("top products sorted by revenue", all(a["revenue"] >= b["revenue"] for a, b in zip(s["topProducts"], s["topProducts"][1:])))
check("reorder block present for all channels", s["reorder"] is not None)
check("cohort rows start at 100%", all(c["retention"][0] == 100 for c in s["cohorts"]), s["cohorts"])
check("margin flagged unavailable", s["margin"]["available"] is False)

status, b2c = call("GET", "/reports/sales" + q + "&channel=B2C", token=token)
check("channel=B2C -> no reorder block", status == 200 and b2c["reorder"] is None, status)
status, b2b = call("GET", "/reports/sales" + q + "&channel=B2B", token=token)
check("channel=B2B leaves POS out", status == 200 and b2b["kpis"]["posSales"] == 0, b2b["kpis"] if status == 200 else b2b)
check("B2B + B2C orders = all orders", b2b["kpis"]["orders"] + b2c["kpis"]["orders"] == k["orders"])

status, _ = call("GET", "/reports/sales?from=2026-13-01", token=token)
check("bad date -> 400", status == 400, status)
status, _ = call("GET", "/reports/sales?channel=XYZ", token=token)
check("bad channel -> 400", status == 400, status)
status, _ = call("GET", "/reports/sales?from=2024-01-01&to=2026-01-01", token=token)
check("range over a year -> 400", status == 400, status)

status, text = call("GET", "/reports/sales/export" + q, token=token, raw=True)
lines = [l for l in text.splitlines() if l.strip()] if status == 200 else []
all_orders = db(f"return await p.order.count({{where:{{orderDate:{{gte:new Date('{start}'),lt:new Date('{end}')}}}}}})")
check("CSV export -> 200 with a header and one line per order", status == 200 and len(lines) == all_orders + 1, (status, len(lines), all_orders))

print("==> finance report")
status, f = call("GET", "/reports/finance" + q, token=token)
check("GET /reports/finance -> 200", status == 200, f)
t = f["totals"]
check("billed = orders + all POS sales", abs(t["billed"] - (truth["rev"] + db(
    f"return Number((await p.posSale.aggregate({{where:{{createdAt:{{gte:new Date('{start}'),lt:new Date('{end}')}}}},_sum:{{total:true}}}}))._sum.total??0)"
))) < 0.01, t)
check("channels add up to the total", abs(sum(c["billed"] for c in f["channels"]) - t["billed"]) < 0.01)
check("collected + outstanding = billed", abs(t["collected"] + t["outstanding"] - t["billed"]) < 0.05, t)
receipts = db(
    f"return Number((await p.creditReceipt.aggregate({{where:{{voidedAt:null,receivedOn:{{gte:new Date('{frm}T00:00:00Z'),lte:new Date('{to}T00:00:00Z')}}}},_sum:{{amount:true}}}}))._sum.amount??0)"
)
credit_rows = sum(r["amount"] for r in f["collections"]["rows"] if r["key"].startswith("CREDIT_"))
check("credit receipts in collections match the DB", abs(credit_rows - receipts) < 0.01, (credit_rows, receipts))
check("collection rows add up", abs(sum(r["amount"] for r in f["collections"]["rows"]) - f["collections"]["total"]) < 0.05)
check("GST: CGST + SGST + IGST = tax", abs(f["gst"]["cgst"] + f["gst"]["sgst"] + f["gst"]["igst"] - f["gst"]["tax"]) < 0.05, f["gst"])
check("trend billed adds up", abs(sum(x["billed"] for x in f["trend"]) - t["billed"]) < 0.05)
status, rcv = call("GET", "/receivables", token=token)
check("receivables block matches /receivables", status == 200 and abs(rcv["totals"]["outstanding"] - f["receivables"]["outstanding"]) < 0.01, (rcv.get("totals") if status == 200 else rcv, f["receivables"]["outstanding"]))

print("==> commerce dashboard")
status, dsh = call("GET", "/dashboard/commerce", token=token)
check("GET /dashboard/commerce -> 200", status == 200, dsh)
fulfil = db("return await p.order.count({where:{status:{in:['PLACED','CONFIRMED','ALLOCATED','PACKED','DISPATCHED']}}})")
check("orders to fulfil match the DB", dsh["toFulfil"]["total"] == fulfil, (dsh["toFulfil"], fulfil))
check("low-stock counts match the list", dsh["lowStock"]["critical"] + dsh["lowStock"]["low"] >= len(dsh["lowStock"]["items"]))
check("at most 6 recent orders", len(dsh["recentOrders"]) <= 6)

print("==> permissions")
STAMP = datetime.now().strftime("%H%M%S%f")


def user_token(role):
    email, pw = f"rp-{role.lower()}-{STAMP}@example.com", "E2e@12345"
    _, br = call("GET", "/branches", token=token)
    br = (br["data"] if isinstance(br, dict) else br)[0]["id"]
    st, u = call("POST", "/users", {"email": email, "password": pw, "fullName": role, "role": role, "branchId": br}, token=token)
    assert st in (200, 201), u
    st, lg = call("POST", "/auth/login", {"email": email, "password": pw})
    assert st in (200, 201), lg
    return lg["accessToken"], br


bm, bm_branch = user_token("BRANCH_MANAGER")
st, bm_sales = call("GET", "/reports/sales" + q, token=bm)
check("Branch Manager can read sales analytics", st == 200, st)
st, bm_fin = call("GET", "/reports/finance" + q, token=bm)
check("Branch Manager can read the finance MIS", st == 200, st)
branch_orders = db(
    f"return await p.order.count({{where:{{branchId:'{bm_branch}',orderDate:{{gte:new Date('{start}'),lt:new Date('{end}')}},status:{{notIn:['DRAFT','CANCELLED']}}}}}})"
)
check("Branch Manager only sees their own branch", st == 200 and bm_sales["kpis"]["orders"] == branch_orders, (bm_sales["kpis"]["orders"], branch_orders))
other = db(f"return (await p.branch.findFirst({{where:{{id:{{not:'{bm_branch}'}}}},select:{{id:true}}}}))?.id ?? null")
if other:
    st, forced = call("GET", "/reports/sales" + q + f"&branchId={other}", token=bm)
    check("Branch Manager cannot ask for another branch", st == 200 and forced["kpis"]["orders"] == branch_orders, forced["kpis"] if st == 200 else st)
st_tok = user_token("SALES_TEAM")[0]
st_, sx = call("GET", "/reports/sales" + q, token=st_tok)
check("Sales team can read sales analytics", st_ == 200, st_)
lt = user_token("LOGISTICS_TEAM")[0]
check("Logistics cannot read sales analytics", call("GET", "/reports/sales" + q, token=lt)[0] == 403)
check("Logistics cannot read the finance MIS", call("GET", "/reports/finance" + q, token=lt)[0] == 403)
check("Sales team cannot read the finance MIS", call("GET", "/reports/finance" + q, token=st_tok)[0] == 403)
status, _ = call("GET", "/reports/finance" + q)
check("no token -> 401", status == 401, status)

print()
if failures:
    print(f"FAILED: {len(failures)}")
    for name in failures:
        print("  - " + name)
    sys.exit(1)
print("ALL PASSED")
