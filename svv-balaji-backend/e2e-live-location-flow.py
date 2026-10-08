"""
End-to-end check of the shopper's live rider location: shown only for their own
local order while it is being carried, with distance and staleness, and never
before pickup or after delivery.

Needs a throwaway database with a storefront customer who has an order and an
active rider (e2e-returns-flow.py leaves both). Stages states by editing rows
directly - never point it at a real database.

  DATABASE_URL=postgresql://.../throwaway BASE_URL=http://localhost:3110/api/v1 python -X utf8 e2e-live-location-flow.py
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime

BASE = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
if "DATABASE_URL" not in os.environ:
    sys.exit("Set DATABASE_URL to the throwaway database the API under test uses")
failures = []
STAMP = datetime.now().strftime("%H%M%S%f")


def check(name, ok, detail=""):
    print(("  ok   " if ok else "  FAIL ") + name + ("" if ok else f"  -> {detail}"))
    if not ok:
        failures.append(name)


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


fx = db(
    "const o=await p.order.findFirst({where:{source:'STOREFRONT',customer:{channel:'B2C',account:{isNot:null}}},orderBy:{createdAt:'desc'},"
    "select:{id:true,customerId:true,orderNumber:true,status:true,fulfillmentMethod:true,warehouseId:true,customer:{select:{phone:true,account:{select:{phone:true}}}}}});"
    "const other=o?await p.order.findFirst({where:{customerId:{not:o.customerId}},select:{orderNumber:true}}):null;"
    "const r=await p.rider.findFirst({where:{status:'ACTIVE'},select:{id:true,fullName:true,lastLatitude:true,lastLongitude:true,lastLocationAt:true}});"
    "return o&&r?{o,r,other}:null"
)
if not fx:
    sys.exit("Need a storefront B2C order and an active rider - run e2e-returns-flow.py on this DB first")
O, R = fx["o"], fx["r"]
phone = O["customer"]["account"]["phone"]
call("POST", "/storefront/auth/otp/request", {"phone": phone})
s, sess = call("POST", "/storefront/auth/otp/verify", {"phone": phone, "code": "123456", "audience": "CUSTOMER"})
if s not in (200, 201):
    sys.exit(f"Could not sign the shopper in: {sess}")
ctok = sess["accessToken"]
orig = {"status": O["status"], "fm": O["fulfillmentMethod"]}
path = f"/storefront/orders/{O['orderNumber']}/live-location"

task = db(
    f"await p.order.update({{where:{{id:'{O['id']}'}},data:{{status:'DISPATCHED',fulfillmentMethod:'LOCAL'}}}});"
    f"const t=await p.deliveryTask.create({{data:{{taskNumber:'DT-LIVE-{STAMP}',orderId:'{O['id']}',warehouseId:'{O['warehouseId']}',status:'ASSIGNED',riderId:'{R['id']}',"
    "dropName:'E2E',dropPhone:'9999999999',dropAddress:'x',dropLatitude:23.2750,dropLongitude:77.4250}});return t.id"
)
try:
    db(f"await p.rider.update({{where:{{id:'{R['id']}'}},data:{{lastLatitude:23.2599,lastLongitude:77.4126,lastLocationAt:new Date()}}}});return true")
    s, b = call("GET", path, token=ctok)
    check("rider assigned but not picked up yet -> tracking:false", s == 200 and b == {"tracking": False}, b)

    db(f"await p.deliveryTask.update({{where:{{id:'{task}'}},data:{{status:'OUT_FOR_DELIVERY'}}}});return true")
    s, b = call("GET", path, token=ctok)
    check("out for delivery -> tracking:true with the rider's last fix", s == 200 and b.get("tracking") is True and abs(b["rider"]["latitude"] - 23.2599) < 1e-6, b)
    check("distance to the drop is worked out (about 2 km here)", s == 200 and b.get("distanceKm") is not None and 1.5 < b["distanceKm"] < 2.6, b.get("distanceKm") if isinstance(b, dict) else b)
    check("fresh fix is not stale; only the rider's first name is shared", s == 200 and b["rider"]["stale"] is False and " " not in b["rider"]["firstName"] and "phone" not in b["rider"], b.get("rider") if isinstance(b, dict) else b)

    db(f"await p.rider.update({{where:{{id:'{R['id']}'}},data:{{lastLocationAt:new Date(Date.now()-5*60000)}}}});return true")
    s, b = call("GET", path, token=ctok)
    check("a 5-minute-old fix is flagged stale", s == 200 and b["rider"]["stale"] is True and b["rider"]["ageSeconds"] >= 290, b.get("rider") if isinstance(b, dict) else b)

    db(f"await p.deliveryTask.update({{where:{{id:'{task}'}},data:{{status:'DELIVERED'}}}});await p.order.update({{where:{{id:'{O['id']}'}},data:{{status:'DELIVERED'}}}});return true")
    s, b = call("GET", path, token=ctok)
    check("after delivery -> tracking:false (no following the rider afterwards)", s == 200 and b == {"tracking": False}, b)

    if fx.get("other"):
        s, b = call("GET", f"/storefront/orders/{fx['other']['orderNumber']}/live-location", token=ctok)
        check("someone else's order -> 404", s == 404, (s, b))
    s, b = call("GET", path)
    check("no sign-in -> 401", s == 401, s)
finally:
    db(
        f"await p.deliveryTask.delete({{where:{{id:'{task}'}}}});"
        f"await p.order.update({{where:{{id:'{O['id']}'}},data:{{status:'{orig['status']}',fulfillmentMethod:{json.dumps(orig['fm'])}}}}});return true"
    )

print()
if failures:
    print(f"FAILED: {len(failures)}")
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print("ALL PASSED")
