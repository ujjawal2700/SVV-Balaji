#!/usr/bin/env python3
"""
End-to-end check of the client decisions of 10 Oct 2026 against a RUNNING API.

  1. No retailer credit: credit terms / limits refused, retailers created prepaid,
     credit notes refused as a refund choice.
  2. Machine list: add, duplicate number refused, inactive machine refused on a run.
  3. A run booked on a machine: snapshot + run times, then its production cost
     (raw from purchase rate + labour + machine + loss + other), per-unit cost on
     completion, raw override and back to automatic, PLANNED run refused.
  4. Machine utilisation and the production cost report include the run.
  5. Traceability: the run is packed, released, and the FG pack still resolves
     back to the farmer (CLAUDE.md rule 6).
  6. Rider pay per kg: rule validated and stored.

Creates its own stamped data; run it on a throwaway database.

  SEED_SUPER_ADMIN_PASSWORD=... python e2e-client-decisions-flow.py
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
step("0. Login + setup")
status, data = call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD}, auth=False)
if status not in (200, 201):
    print("  FATAL login failed", status, data)
    sys.exit(2)
token = data["accessToken"]
BR = rows(must("GET", "/branches"))[0]["id"]
WH = must("POST", "/warehouses", {"name": f"E2E Mill {STAMP}", "location": "Test", "branchId": BR, "capacity": 50000})["id"]
check(True, "branch + warehouse ready")

# ---------------------------------------------------------------------------
step("1. No retailer credit")
base = {"channel": "B2B", "type": "RETAILER", "name": f"E2E Kirana {STAMP}", "phone": f"96{STAMP[-8:]}",
        "gstin": f"29ABCDE{STAMP[-4:]}F1Z5", "billingAddress": "1 Market Road", "branchId": BR}
status, data = call("POST", "/customers", {**base, "paymentTerms": "CREDIT_30"})
check(status == 400 and "not offered" in json.dumps(data), "credit terms refused", (status, data))
status, data = call("POST", "/customers", {**base, "creditLimit": 50000})
check(status == 400 and "not offered" in json.dumps(data), "credit limit refused", (status, data))
cust = must("POST", "/customers", base)
check(cust["paymentTerms"] == "PREPAID" and cust.get("creditLimit") is None, "retailer created prepaid with no limit", cust.get("paymentTerms"))
status, data = call("PATCH", f"/customers/{cust['id']}", {"paymentTerms": "CREDIT_15"})
check(status == 400, "cannot be switched to credit later", (status, data))
status, data = call("PATCH", "/return-settings/B2B", {"allowedRefundMethods": ["CREDIT_NOTE", "WALLET"], "defaultRefundMethod": "WALLET"})
check(status == 400, "credit note refused as a retailer refund choice", (status, data))
rs = must("GET", "/return-settings")
check("CREDIT_NOTE" not in rs["B2B"]["allowedRefundMethods"], "retailer refund choices are wallet / UPI / bank", rs["B2B"]["allowedRefundMethods"])

# ---------------------------------------------------------------------------
step("2. Machine list")
mnum = f"M-{STAMP[-5:]}"
machine = must("POST", "/machines", {"name": f"E2E Chakki {STAMP}", "machineNumber": mnum, "productionLine": "Line 3", "branchId": BR, "hoursPerDay": 10})
check(machine["code"].startswith("MCH-") and machine["hoursPerDay"] == 10, f"machine {machine['code']} added")
status, data = call("POST", "/machines", {"name": "Dup", "machineNumber": mnum, "branchId": BR})
check(status == 409, "duplicate machine number refused", (status, data))
spare = must("POST", "/machines", {"name": f"E2E Spare {STAMP}", "branchId": BR})
must("PATCH", f"/machines/{spare['id']}", {"isActive": False})
listed = must("GET", f"/machines?branchId={BR}&activeOnly=true")
check(any(m["id"] == machine["id"] for m in listed) and not any(m["id"] == spare["id"] for m in listed), "active list hides the inactive machine")

# ---------------------------------------------------------------------------
step("3. Farmer -> raw batch at a known purchase rate")
farmer = must("POST", "/farmers", {
    "fullName": f"E2E Farmer {STAMP}", "mobile": f"95{STAMP[-8:]}", "village": "Ashta",
    "district": "Sehore", "state": "Madhya Pradesh", "farmSizeAcres": 5.5, "cropDetails": "Wheat",
    "branchId": BR, "aadhaarNumber": f"{STAMP}34"[:12], "address": "Ashta, Sehore", "landType": "Irrigated",
    "irrigationType": "Canal", "bankAccountName": "E2E Farmer", "bankName": "SBI",
    "bankAccountNo": f"{STAMP}11", "ifscCode": "SBIN0001234",
})
approved = must("PATCH", f"/farmers/{farmer['id']}/verify", {"action": "APPROVED", "remarks": "e2e"})
FARMER_CODE = approved["farmerCode"]
insp = must("POST", "/harvest-inspections", {
    "farmerId": farmer["id"], "cropName": "Wheat", "inspectionDate": TODAY,
    "moistureLevel": 11.2, "foreignMatter": 0.5, "grainSize": "Medium", "result": "APPROVED",
})
coll = must("POST", "/collections", {
    "inspectionId": insp["id"], "branchId": BR, "collectionDate": TODAY, "collectionLocation": "Farm gate",
    "grossWeight": 1050, "netWeight": 1000, "warehouseId": WH, "purchaseRate": 25.5,
})
batches = rows(must("GET", f"/batches?warehouseId={WH}"))
rm = next((b for b in batches if b.get("collectionId") == coll["id"] or (b.get("collection") or {}).get("id") == coll["id"]), batches[0])
RM_ID = rm["id"]
must("POST", "/quality-inspections", {"stage": "RAW_MATERIAL", "rawMaterialBatchId": RM_ID, "moisture": 11.2, "purity": 99.1, "foreignMatter": 0.5, "result": "PASS"})
check(rm["batchNumber"].startswith("RM-"), f"raw batch {rm['batchNumber']} at Rs 25.50/kg")

product = must("POST", "/products", {"name": f"E2E Atta {STAMP}", "sku": f"E2EC-{STAMP}", "unit": "PACK"})
recipe = must("POST", "/recipes", {
    "recipeCode": f"E2EC-{STAMP}", "productId": product["id"], "name": "E2E Wheat Flour",
    "productionType": "SINGLE_GRAIN", "batchYieldQuantity": 900,
    "ingredients": [{"cropName": "Wheat", "quantity": 1000, "unit": "KG"}],
})
must("PATCH", f"/recipes/{recipe['id']}/approve", {})

# ---------------------------------------------------------------------------
step("4. Run booked on a machine, with its cost")
run_body = {"recipeId": recipe["id"], "branchId": BR, "warehouseId": WH, "productionDate": TODAY, "plannedQuantity": 400,
            "operatorName": "E2E Operator", "consumptions": [{"rawMaterialBatchId": RM_ID, "quantityUsed": 400}]}
status, data = call("POST", "/production-batches", {**run_body, "machineId": spare["id"]})
check(status == 400 and "inactive" in json.dumps(data), "an inactive machine cannot be booked", (status, data))
pb = must("POST", "/production-batches", {**run_body, "machineId": machine["id"]})
check(pb["machineId"] == machine["id"] and pb["machineName"] == machine["name"] and pb["machineNumber"] == mnum and pb["productionLine"] == "Line 3",
      "run carries the machine snapshot (name, number, line)", {k: pb.get(k) for k in ("machineId", "machineName", "machineNumber", "productionLine")})
check(pb.get("startedAt") is not None and pb.get("completedAt") is None, "run start time stamped")

sheet = must("GET", f"/production-batches/{pb['id']}/cost")
check(not sheet["recorded"] and sheet["rawMaterial"]["automatic"] == 10200 and sheet["rawMaterial"]["missingRate"] == [],
      "raw material worked out automatically: 400 kg x Rs 25.50 = Rs 10,200", sheet["rawMaterial"])
status, data = call("PUT", f"/production-batches/{pb['id']}/cost", {"otherCosts": [{"label": " ", "amount": 5}]})
check(status == 400, "an other-cost line needs a label", (status, data))
sheet = must("PUT", f"/production-batches/{pb['id']}/cost", {
    "labourCost": 500, "machineCost": 300, "lossCost": 100, "otherCosts": [{"label": "Packaging", "amount": 200}],
})
check(sheet["recorded"] and sheet["totalCost"] == 11300 and sheet["costPerUnit"] is None,
      "cost recorded: 10,200 + 500 + 300 + 100 + 200 = 11,300 (per-unit waits for output)", sheet)

must("POST", "/quality-inspections", {"stage": "IN_PROCESS", "productionBatchId": pb["id"], "grindingQuality": "Fine", "temperature": 41, "result": "PASS"})
done = must("PATCH", f"/production-batches/{pb['id']}/complete", {"actualQuantity": 380})
check(done.get("completedAt") is not None, "completion time stamped")
sheet = must("GET", f"/production-batches/{pb['id']}/cost")
check(abs(sheet["costPerUnit"] - 29.7368) < 0.0001, "per-unit cost on completion: 11,300 / 380 = 29.7368", sheet["costPerUnit"])

sheet = must("PUT", f"/production-batches/{pb['id']}/cost", {"rawMaterialCost": 10000})
check(sheet["rawMaterial"]["overridden"] and sheet["totalCost"] == 11100, "raw material override: total 11,100", sheet["totalCost"])
sheet = must("PUT", f"/production-batches/{pb['id']}/cost", {"rawMaterialCost": None})
check(not sheet["rawMaterial"]["overridden"] and sheet["totalCost"] == 11300 and sheet["labourCost"] == 500,
      "back to the automatic raw cost; other figures kept", sheet)

planned = must("POST", "/production-batches", {**run_body, "machineId": machine["id"], "status": "PLANNED", "consumptions": [{"rawMaterialBatchId": RM_ID, "quantityUsed": 50}]})
check(planned.get("startedAt") is None, "a planned run has no start time yet")
status, data = call("PUT", f"/production-batches/{planned['id']}/cost", {"labourCost": 10})
check(status == 400, "cost cannot be recorded on a run that has not started", (status, data))
must("PATCH", f"/production-batches/{planned['id']}/status", {"status": "CANCELLED"})

# ---------------------------------------------------------------------------
step("5. Machine utilisation + production cost report")
ut = must("GET", f"/machines/utilisation?from={TODAY}&to={TODAY}&branchId={BR}")
row = next((m for m in ut["machines"] if m["machine"]["id"] == machine["id"]), None)
check(row is not None and row["runs"] == 1 and row["completedRuns"] == 1 and row["runsWithoutTimes"] == 0,
      "utilisation counts the completed run (cancelled planned run ignored)", row and {k: row[k] for k in ("runs", "completedRuns", "runsWithoutTimes", "runHours")})
check(row is not None and row["availableHours"] == 10 and row["outputQuantity"] == 380 and row["utilisationPercent"] is not None,
      "10 h available today, 380 output, utilisation % worked out", row and {k: row[k] for k in ("availableHours", "outputQuantity", "utilisationPercent")})
status, data = call("DELETE", f"/machines/{machine['id']}")
check(status == 409, "a machine with runs cannot be deleted (deactivate instead)", (status, data))
must("DELETE", f"/machines/{spare['id']}")
check(True, "an unused machine can be deleted")

rep = must("GET", f"/production-cost/report?from={TODAY}&to={TODAY}&productId={product['id']}")
r = next((x for x in rep["runs"] if x["id"] == pb["id"]), None)
check(r is not None and r["costRecorded"] and r["totalCost"] == 11300 and r["otherCost"] == 200 and r["machine"]["code"] == machine["code"],
      "report lists the run with its cost and machine", r)
check(rep["totals"]["totalCost"] == 11300 and rep["byProduct"][0]["averageCostPerUnit"] is not None, "report totals and per-product average", rep["totals"])

# ---------------------------------------------------------------------------
step("6. Traceability still resolves farmer -> raw -> machine-booked run -> FG")
fg = must("POST", "/finished-goods", {
    "productionBatchId": pb["id"], "packagingType": "pouch", "netWeight": 5, "packCount": 70,
    "mrp": 250, "packagingDate": TODAY, "manufacturingDate": TODAY, "shelfLifeDays": 120,
})
must("POST", "/quality-inspections", {"stage": "FINISHED_GOODS", "finishedGoodsBatchId": fg["id"], "productAppearance": "Good", "productWeight": 5, "result": "PASS", "shelfLifeVerified": True})
must("PATCH", f"/quality-inspections/release/{fg['id']}", {})
tr = must("GET", f"/trace/{fg['fgBatchNumber']}")
farmers = tr.get("farmers") or []
check(tr["production"]["productionBatchNumber"] == pb["productionBatchNumber"] and any(f.get("farmerCode") == FARMER_CODE for f in farmers),
      f"{fg['fgBatchNumber']} -> {pb['productionBatchNumber']} -> {rm['batchNumber']} -> {FARMER_CODE}", {"production": tr.get("production"), "farmers": farmers})

# ---------------------------------------------------------------------------
step("7. Rider pay per kg")
status, data = call("POST", "/delivery/earning-rules", {"name": "Bad kg", "kind": "PER_KG", "config": {"ratePerKg": -1}})
check(status == 400, "a negative rate is refused", (status, data))
rule = must("POST", "/delivery/earning-rules", {"name": f"E2E per kg {STAMP}", "kind": "PER_KG", "config": {"ratePerKg": 2, "freeKg": 5, "maxAmount": 60}})
check(rule["kind"] == "PER_KG" and rule["config"]["ratePerKg"] == 2, "per-kg rule stored")
must("PATCH", f"/delivery/earning-rules/{rule['id']}", {"isActive": False})

print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
sys.exit(1 if failures else 0)
