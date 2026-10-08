"""
End-to-end check of closing a dispatched order as undelivered: stock back into
its batches (and the pack still traces to its farmer), prepaid money to the
Refund Wallet, invoice cancelled or credited, and every refusal.

Needs a throwaway database with a B2C consumer, a product with a B2C price and
QA-released stock (e2e-loyalty-flow.py / e2e-pos-flow.py leave these). Edits
rows directly to stage cases - never point it at a real database.

  DATABASE_URL=postgresql://.../throwaway BASE_URL=http://localhost:3110/api/v1 \
  SEED_SUPER_ADMIN_PASSWORD=... python -X utf8 e2e-undelivered-flow.py
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime

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

# A product with a live B2C price and at least 6 free QA-released packs in one warehouse.
fx = db(
    "const now=new Date();"
    "const rows=await p.finishedGoodsStock.findMany({where:{quantity:{gte:6},fgBatch:{holdStatus:'ACTIVE',fgBatchNumber:{startsWith:'FG-2'},product:{priceLists:{some:{channel:'B2C',effectiveFrom:{lte:now},OR:[{effectiveTo:null},{effectiveTo:{gt:now}}]}}}}},"
    "include:{fgBatch:{select:{fgBatchNumber:true,productId:true}}},orderBy:{quantity:'desc'}});"
    "const r=rows.find(x=>x.quantity-x.reservedQuantity>=6);"
    "const c=await p.customer.findFirst({where:{channel:'B2C',status:'ACTIVE'},select:{id:true}});"
    "return r&&c?{warehouseId:r.warehouseId,productId:r.fgBatch.productId,customerId:c.id}:null"
)
if not fx:
    sys.exit("No B2C customer + priced product with 6 free packs - run e2e-loyalty-flow.py on this DB first")


def dispatched_order(qty=2):
    s, o = call("POST", "/orders", {"customerId": fx["customerId"], "warehouseId": fx["warehouseId"], "items": [{"productId": fx["productId"], "quantity": qty}]}, token=tok)
    assert s in (200, 201), o
    s, r = call("POST", f"/orders/{o['id']}/override-status", {"status": "DISPATCHED", "reason": "e2e: dispatch for undelivered test"}, token=tok)
    assert s == 200, r
    return o["id"]


def stock_of(order_id):
    return db(
        f"const a=await p.orderAllocation.findMany({{where:{{orderId:'{order_id}'}},select:{{warehouseId:true,fgBatchId:true,quantity:true,releasedAt:true}}}});"
        "const out=[];for(const x of a){const s=await p.finishedGoodsStock.findUnique({where:{warehouseId_fgBatchId:{warehouseId:x.warehouseId,fgBatchId:x.fgBatchId}}});"
        "const b=await p.finishedGoodsBatch.findUnique({where:{id:x.fgBatchId},select:{fgBatchNumber:true}});"
        "out.push({fg:b.fgBatchNumber,batch:x.fgBatchId,wh:x.warehouseId,q:x.quantity,released:!!x.releasedAt,stock:s?s.quantity:0,reserved:s?s.reservedQuantity:0})}return out"
    )


step("1. refusals")
O1 = dispatched_order()
trace_before = {}
for a in db(f"return (await p.orderAllocation.findMany({{where:{{orderId:'{O1}'}},select:{{fgBatch:{{select:{{fgBatchNumber:true}}}}}}}})).map(x=>x.fgBatch.fgBatchNumber)"):
    s, tr = call("GET", f"/trace/{a}", token=tok)
    trace_before[a] = sorted(set(__import__('re').findall(r'SVV-\d{4}-\d{6}', json.dumps(tr)))) if s == 200 else None
check("order is DISPATCHED with an invoice", db(f"return (await p.order.findUnique({{where:{{id:'{O1}'}}}})).status") == "DISPATCHED")
s, b = call("POST", f"/orders/{O1}/close-undelivered", {"reason": "x"}, token=tok)
check("a reason under 3 characters -> 400", s == 400, b)
s, b = call("POST", f"/orders/{O1}/close-undelivered", {"reason": "customer refused"}, token=tok)
check("no task, no RTO and goods not confirmed in hand -> 400", s == 400 and "goods" in json.dumps(b).lower(), b)
task_id = db(
    f"const o=await p.order.findUnique({{where:{{id:'{O1}'}},select:{{warehouseId:true,orderNumber:true}}}});"
    f"const t=await p.deliveryTask.create({{data:{{taskNumber:'DT-E2E-{STAMP}',orderId:'{O1}',warehouseId:o.warehouseId,status:'OUT_FOR_DELIVERY',dropName:'E2E',dropPhone:'9999999999',dropAddress:'x'}}}});return t.id"
)
s, b = call("POST", f"/orders/{O1}/close-undelivered", {"reason": "customer refused", "goodsInHand": True}, token=tok)
check("a delivery still out for delivery -> 400 even with goods 'in hand'", s == 400 and "out for delivery" in json.dumps(b), b)
db(f"await p.deliveryTask.update({{where:{{id:'{task_id}'}},data:{{status:'RETURNED_TO_STORE',returnedAt:new Date()}}}});return true")

step("2. close it: stock back in the same batches, invoice cancelled (same month)")
before = stock_of(O1)
inv = db(f"return await p.invoice.findFirst({{where:{{orderId:'{O1}',status:'ISSUED'}},select:{{id:true,invoiceNumber:true}}}})")
s, r = call("POST", f"/orders/{O1}/close-undelivered", {"reason": "customer refused twice"}, token=tok)
check("close -> 200 once the goods are back at the store", s == 200, r)
after = stock_of(O1)
check("every allocated pack is back on its batch row", all(a["stock"] == b0["stock"] + b0["q"] for a, b0 in zip(after, before)), (before, after))
check("allocations released", all(a["released"] for a in after), after)
check("order CANCELLED with an 'Undelivered' reason", db(f"const o=await p.order.findUnique({{where:{{id:'{O1}'}}}});return o.status+'|'+o.cancelledReason").startswith("CANCELLED|Undelivered"))
moves = db(f"return await p.stockMovement.count({{where:{{reference:(await p.order.findUnique({{where:{{id:'{O1}'}}}})).orderNumber,movementType:'STOCK_IN'}}}})")
check("a STOCK_IN ledger row per allocation", moves == len(after), (moves, len(after)))
if inv:
    st = db(f"return (await p.invoice.findUnique({{where:{{id:'{inv['id']}'}}}})).status")
    check("same-month invoice cancelled", st == "CANCELLED" and s == 200 and "cancelled" in (r.get("gst") or ""), (st, r.get("gst") if isinstance(r, dict) else r))
else:
    check("an invoice was issued at dispatch (GST settings complete on this DB)", False, "no invoice")
ev = db(f"return (await p.orderEvent.findMany({{where:{{orderId:'{O1}'}},select:{{type:true}}}})).map(e=>e.type)")
check("timeline has CLOSED_UNDELIVERED and GST_REVERSED", "CLOSED_UNDELIVERED" in ev and "GST_REVERSED" in ev, ev)
s, b = call("POST", f"/orders/{O1}/close-undelivered", {"reason": "again please", "goodsInHand": True}, token=tok)
check("closing twice -> 400", s == 400, b)

step("3. traceability: the returned packs still resolve to the same farmers")
import re
for fg, farmers in trace_before.items():
    s, tr = call("GET", f"/trace/{fg}", token=tok)
    now = sorted(set(re.findall(r'SVV-\d{4}-\d{6}', json.dumps(tr)))) if s == 200 else None
    check(f"GET /trace/{fg} resolves to a farmer, same as before dispatch", s == 200 and bool(now) and now == farmers, (s, farmers, now))

step("4. prepaid online order: refund to the wallet; earlier-month invoice -> credit note")
O2 = dispatched_order(3)
total = db(
    f"await p.order.update({{where:{{id:'{O2}'}},data:{{paymentMode:'ONLINE',paymentStatus:'PAID'}}}});"
    f"await p.invoice.updateMany({{where:{{orderId:'{O2}',status:'ISSUED'}},data:{{invoiceDate:new Date(Date.now()-40*86400000)}}}});"
    f"return Number((await p.order.findUnique({{where:{{id:'{O2}'}}}})).total)"
)
bal0 = db(f"return Number((await p.customer.findUnique({{where:{{id:'{fx['customerId']}'}}}})).refundWalletBalance)")
s, r = call("POST", f"/orders/{O2}/close-undelivered", {"reason": "address does not exist", "goodsInHand": True}, token=tok)
check("close -> 200 (goods confirmed in hand, no task)", s == 200, r)
check("the whole prepaid amount went to the Refund Wallet", s == 200 and abs(r["refundedToWallet"] - total) < 0.01, (r.get("refundedToWallet") if isinstance(r, dict) else r, total))
bal1 = db(f"return Number((await p.customer.findUnique({{where:{{id:'{fx['customerId']}'}}}})).refundWalletBalance)")
check("wallet balance went up by exactly that", abs(bal1 - bal0 - total) < 0.01, (bal0, bal1, total))
wtx = db(f"return await p.refundWalletTransaction.count({{where:{{orderId:'{O2}',reason:'UNDELIVERED_REFUND'}}}})")
check("one UNDELIVERED_REFUND wallet line", wtx == 1, wtx)
check("payment status REFUNDED", db(f"return (await p.order.findUnique({{where:{{id:'{O2}'}}}})).paymentStatus") == "REFUNDED")
notes = db(
    f"const i=await p.invoice.findFirst({{where:{{orderId:'{O2}'}}}});"
    "const n=await p.creditNote.findMany({where:{invoiceId:i.id,status:'ISSUED'},select:{grandTotal:true}});"
    "return {inv:i.status,invTotal:Number(i.grandTotal),notes:n.map(x=>Number(x.grandTotal))}"
)
check("earlier-month invoice kept and credited in full by a credit note", notes["inv"] == "ISSUED" and len(notes["notes"]) == 1 and abs(notes["notes"][0] - notes["invTotal"]) < 0.02, notes)

step("5. not dispatched, and permissions")
s, o3 = call("POST", "/orders", {"customerId": fx["customerId"], "warehouseId": fx["warehouseId"], "items": [{"productId": fx["productId"], "quantity": 1}]}, token=tok)
s, b = call("POST", f"/orders/{o3['id']}/close-undelivered", {"reason": "not even sent", "goodsInHand": True}, token=tok)
check("an order that was never dispatched -> 400", s == 400 and "Only a dispatched order" in json.dumps(b), b)
call("POST", f"/orders/{o3['id']}/cancel", {"reason": "e2e cleanup"}, token=tok)


def user_token(role):
    email, pw = f"ud-{role.lower()}-{STAMP}@example.com", "E2e@12345"
    _, br = call("GET", "/branches", token=tok)
    br = (br["data"] if isinstance(br, dict) else br)[0]["id"]
    st, u = call("POST", "/users", {"email": email, "password": pw, "fullName": role, "role": role, "branchId": br}, token=tok)
    assert st in (200, 201), u
    return call("POST", "/auth/login", {"email": email, "password": pw})[1]["accessToken"]


O4 = dispatched_order(1)
check("Logistics cannot close an order as undelivered", call("POST", f"/orders/{O4}/close-undelivered", {"reason": "no permission", "goodsInHand": True}, token=user_token("LOGISTICS_TEAM"))[0] == 403)
s, _ = call("POST", f"/orders/{O4}/close-undelivered", {"reason": "e2e cleanup", "goodsInHand": True}, token=tok)
check("cleanup close -> 200", s == 200)

print()
if failures:
    print(f"FAILED: {len(failures)}")
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print("ALL PASSED")
