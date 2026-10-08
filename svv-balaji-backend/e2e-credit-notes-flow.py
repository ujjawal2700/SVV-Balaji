"""
End-to-end check of GST credit notes and GSTR-1.

Needs a throwaway database that already has issued invoices with multi-pack
lines and completed POS sales paid by UPI/card (run e2e-pos-flow.py and
e2e-loyalty-flow.py on it first). The script back-dates a few invoices
directly in that database to test the month and deadline rules, so never point
it at a real one.

  DATABASE_URL=postgresql://.../throwaway BASE_URL=http://localhost:3110/api/v1 \
  SEED_SUPER_ADMIN_PASSWORD=... python -X utf8 e2e-credit-notes-flow.py
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
STAMP = datetime.now().strftime("%H%M%S%f")


def check(name, ok, detail=""):
    print(("  ok   " if ok else "  FAIL ") + name + ("" if ok else f"  -> {detail}"))
    if not ok:
        failures.append(name)


def step(t):
    print(f"\n==> {t}")


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

# An issued invoice with a line of 3+ packs that nothing has credited yet.
inv_id = db(
    "const l=await p.invoiceLine.findFirst({where:{quantity:{gte:3},isService:false,invoice:{status:'ISSUED',orderId:{not:null},creditNotes:{none:{}}}},"
    "orderBy:{invoice:{invoiceDate:'desc'}},select:{invoiceId:true}});return l?.invoiceId??null"
)
if not inv_id:
    sys.exit("No issued invoice with a 3+ pack line - run e2e-loyalty-flow.py / e2e-pos-flow.py on this DB first")

step("1. what can be credited")
s, cr = call("GET", f"/invoices/{inv_id}/creditable", token=tok)
check("GET creditable -> 200 and open", s == 200 and cr["open"] is True, cr)
line = next(l for l in cr["lines"] if l["quantity"] >= 3 and not l["isService"])
check("nothing credited yet", line["creditedQuantity"] == 0 and line["remainingQuantity"] == line["quantity"], line)
q_total = line["quantity"]

step("2. a note for 1 pack, in proportion")
s, n1 = call("POST", f"/invoices/{inv_id}/credit-notes", {"reason": "SALES_RETURN", "remark": f"e2e one pack {STAMP}", "lines": [{"invoiceLineId": line["invoiceLineId"], "quantity": 1}]}, token=tok)
check("issue -> 201", s == 201, n1)
check("numbered CN/<FY>-NNNNNN", s == 201 and n1["noteNumber"].startswith("CN/"), n1.get("noteNumber") if isinstance(n1, dict) else n1)
expected = round(line["lineTotal"] / q_total, 2)
check("value = line total / qty (to a paisa)", s == 201 and abs(n1["grandTotal"] - expected) <= 0.02, (n1.get("grandTotal"), expected))
check("taxable + tax = total", s == 201 and abs(n1["taxableTotal"] + n1["taxTotal"] - n1["grandTotal"]) < 0.005, n1)
check("tax split matches the invoice (intra: CGST+SGST, inter: IGST)", s == 201 and (n1["igstTotal"] == 0) == (not n1["isInterState"]), n1)
check("reason label", s == 201 and n1["reasonLabel"] == "Sales return")

step("3. refusals")
s, b = call("POST", f"/invoices/{inv_id}/credit-notes", {"reason": "SALES_RETURN", "remark": "too many", "lines": [{"invoiceLineId": line["invoiceLineId"], "quantity": q_total}]}, token=tok)
check("more packs than are left -> 400", s == 400 and "can still be credited" in json.dumps(b), b)
s, b = call("POST", f"/invoices/{inv_id}/credit-notes", {"reason": "SALES_RETURN", "remark": "both", "lines": [{"invoiceLineId": line["invoiceLineId"], "quantity": 1, "amount": line["lineTotal"]}]}, token=tok)
check("packs back credited for more than they are worth -> 400", s == 400 and "more than" in json.dumps(b), b)
s, b = call("POST", f"/invoices/{inv_id}/credit-notes", {"reason": "SALES_RETURN", "remark": "big", "lines": [{"invoiceLineId": line["invoiceLineId"], "amount": line["lineTotal"] * 5}]}, token=tok)
check("an amount beyond what is left -> 400", s == 400 and "at most" in json.dumps(b), b)
s, b = call("POST", f"/invoices/{inv_id}/credit-notes", {"reason": "NOPE", "remark": "x", "lines": []}, token=tok)
check("bad reason / no lines -> 400", s == 400, b)

step("4. a discount after sale, by amount")
s, n2 = call("POST", f"/invoices/{inv_id}/credit-notes", {"reason": "POST_SALE_DISCOUNT", "remark": "goodwill", "lines": [{"invoiceLineId": line["invoiceLineId"], "amount": 10}]}, token=tok)
check("issue by amount -> 201, quantity 0, total exactly ₹10", s == 201 and n2["lines"][0]["quantity"] == 0 and n2["grandTotal"] == 10, n2)

step("5. the last packs take exactly what is left")
s, cr2 = call("GET", f"/invoices/{inv_id}/creditable", token=tok)
l2 = next(l for l in cr2["lines"] if l["invoiceLineId"] == line["invoiceLineId"])
check("creditable shows 1 pack and ₹ credited", l2["creditedQuantity"] == 1 and abs(l2["creditedAmount"] - (n1["grandTotal"] + 10)) < 0.01, l2)
s, n3 = call("POST", f"/invoices/{inv_id}/credit-notes", {"reason": "SALES_RETURN", "remark": "rest back", "lines": [{"invoiceLineId": line["invoiceLineId"], "quantity": q_total - 1}]}, token=tok)
check("credit the remaining packs -> 201", s == 201, n3)
sums = db(
    f"const a=await p.creditNoteLine.aggregate({{where:{{invoiceLineId:'{line['invoiceLineId']}',creditNote:{{status:'ISSUED'}}}},_sum:{{taxableValue:true,cgstAmount:true,sgstAmount:true,igstAmount:true,quantity:true}}}});"
    f"const l=await p.invoiceLine.findUnique({{where:{{id:'{line['invoiceLineId']}'}}}});"
    "return {cq:Number(a._sum.quantity),ct:Number(a._sum.taxableValue),cx:Number(a._sum.cgstAmount)+Number(a._sum.sgstAmount)+Number(a._sum.igstAmount),"
    "q:Number(l.quantity),t:Number(l.taxableValue),x:Number(l.cgstAmount)+Number(l.sgstAmount)+Number(l.igstAmount)}"
)
check("notes on the line add up to the invoice line to the paisa", abs(sums["ct"] - sums["t"]) < 0.005 and abs(sums["cx"] - sums["x"]) < 0.005 and sums["cq"] == sums["q"], sums)
s, b = call("POST", f"/invoices/{inv_id}/credit-notes", {"reason": "SALES_RETURN", "remark": "again", "lines": [{"invoiceLineId": line["invoiceLineId"], "quantity": 1}]}, token=tok)
check("nothing left -> 400", s == 400, b)

step("6. reading")
s, lst = call("GET", f"/credit-notes?search={n1['noteNumber']}", token=tok)
check("list finds it by number", s == 200 and lst["meta"]["total"] == 1 and lst["data"][0]["invoice"]["id"] == inv_id, lst)
s, fi = call("GET", f"/invoices/{inv_id}/credit-notes", token=tok)
check("three notes against the invoice", s == 200 and len(fi) == 3, fi)
s, one = call("GET", f"/credit-notes/{n3['id']}", token=tok)
check("get one with lines and HSN summary", s == 200 and len(one["lines"]) == 1 and len(one["hsnSummary"]) == 1, one)

step("7. cancel in its own month gives the value back")
s, c = call("POST", f"/credit-notes/{n2['id']}/cancel", {"remark": "issued by mistake"}, token=tok)
check("cancel -> 201, CANCELLED", s == 201 and c["status"] == "CANCELLED", c)
s, cr3 = call("GET", f"/invoices/{inv_id}/creditable", token=tok)
l3 = next(l for l in cr3["lines"] if l["invoiceLineId"] == line["invoiceLineId"])
check("the ₹10 is creditable again", abs(l3["remainingAmount"] - 10) < 0.01, l3)
s, b = call("POST", f"/credit-notes/{n2['id']}/cancel", {"remark": "twice"}, token=tok)
check("cancel twice -> 400", s == 400, b)
db(f"await p.creditNote.update({{where:{{id:'{n1['id']}'}},data:{{noteDate:new Date(Date.now()-40*86400000)}}}});return true")
s, b = call("POST", f"/credit-notes/{n1['id']}/cancel", {"remark": "too late"}, token=tok)
check("a note from an earlier month cannot be cancelled -> 400", s == 400 and "earlier month" in json.dumps(b), b)
db(f"await p.creditNote.update({{where:{{id:'{n1['id']}'}},data:{{noteDate:new Date()}}}});return true")

s, b = call("POST", f"/invoices/{inv_id}/cancel", {"reasonCode": "2", "remark": "has notes"}, token=tok)
check("an invoice with live credit notes cannot be cancelled -> 400", s == 400 and "credit note" in json.dumps(b), b)

step("8. s.34(2) deadline")
old_inv = db(
    "const i=await p.invoice.findFirst({where:{status:'ISSUED',creditNotes:{none:{}},lines:{some:{isService:false}}},orderBy:{invoiceDate:'asc'},"
    "select:{id:true,invoiceDate:true,lines:{where:{isService:false},select:{id:true},take:1}}});"
    "await p.invoice.update({where:{id:i.id},data:{invoiceDate:new Date('2025-03-15T06:00:00Z')}});return {id:i.id,date:i.invoiceDate,line:i.lines[0].id}"
)
s, b = call("POST", f"/invoices/{old_inv['id']}/credit-notes", {"reason": "SALES_RETURN", "remark": "late", "lines": [{"invoiceLineId": old_inv["line"], "quantity": 1}]}, token=tok)
check("an FY 2024-25 invoice after 30 Nov 2025 -> 400", s == 400 and "s.34(2)" in json.dumps(b), b)
s, crd = call("GET", f"/invoices/{old_inv['id']}/creditable", token=tok)
check("creditable says it is closed", s == 200 and crd["open"] is False, crd)
db(f"await p.invoice.update({{where:{{id:'{old_inv['id']}'}},data:{{invoiceDate:new Date('{old_inv['date']}')}}}});return true")

step("9. POS refund: same month -> invoice cancelled; earlier month -> credit note")
sales = db(
    f"return await p.posSale.findMany({{where:{{status:'COMPLETED',paymentMode:{{not:'CASH'}},invoices:{{some:{{status:'ISSUED',creditNotes:{{none:{{}}}}}},none:{{id:'{inv_id}'}}}}}},"
    "select:{id:true,saleNumber:true,total:true,invoices:{where:{status:'ISSUED'},select:{id:true,invoiceNumber:true}}},take:2})"
)
if len(sales) < 2:
    check("two non-cash POS sales with invoices exist", False, sales)
else:
    a, b2 = sales
    s, r = call("POST", f"/pos/sales/{a['id']}/refund", {"reason": "e2e same month refund"}, token=tok)
    st = db(f"return (await p.invoice.findUnique({{where:{{id:'{a['invoices'][0]['id']}'}},select:{{status:true}}}})).status")
    notes_a = db(f"return await p.creditNote.count({{where:{{invoiceId:'{a['invoices'][0]['id']}'}}}})")
    check("same-month refund cancels the invoice, no credit note", s in (200, 201) and st == "CANCELLED" and notes_a == 0, (s, r if s >= 400 else st, notes_a))

    db(f"await p.invoice.update({{where:{{id:'{b2['invoices'][0]['id']}'}},data:{{invoiceDate:new Date(Date.now()-40*86400000)}}}});return true")
    s, r = call("POST", f"/pos/sales/{b2['id']}/refund", {"reason": "e2e last month refund"}, token=tok)
    after = db(
        f"const i=await p.invoice.findUnique({{where:{{id:'{b2['invoices'][0]['id']}'}},select:{{status:true,grandTotal:true}}}});"
        f"const n=await p.creditNote.findMany({{where:{{invoiceId:'{b2['invoices'][0]['id']}'}},select:{{grandTotal:true,status:true}}}});"
        "return {inv:i.status,invTotal:Number(i.grandTotal),notes:n.map(x=>({t:Number(x.grandTotal),s:x.status}))}"
    )
    check("earlier-month refund keeps the invoice and credits all of it", s in (200, 201) and after["inv"] == "ISSUED" and len(after["notes"]) == 1
          and abs(after["notes"][0]["t"] - after["invTotal"]) <= 0.02, (s, r if s >= 400 else after))
    db(f"await p.invoice.update({{where:{{id:'{b2['invoices'][0]['id']}'}},data:{{invoiceDate:new Date()}}}});return true")

step("10. GSTR-1 for this month")
month = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).strftime("%Y-%m")
s, g = call("GET", f"/gst-returns/gstr1?month={month}", token=tok)
check("GET gstr1 -> 200", s == 200, g)
if s == 200:
    truth = db(
        f"const [y,m]='{month}'.split('-').map(Number);const start=new Date(Date.UTC(y,m-1,1)-330*60000);const end=new Date(Date.UTC(m===12?y+1:y,m===12?0:m,1)-330*60000);"
        "const r={gte:start,lt:end};"
        "const ia=await p.invoice.aggregate({where:{invoiceDate:r,status:'ISSUED'},_sum:{taxableTotal:true,taxTotal:true},_count:{_all:true}});"
        "const ic=await p.invoice.count({where:{invoiceDate:r}});"
        "const na=await p.creditNote.aggregate({where:{noteDate:r,status:'ISSUED'},_sum:{taxableTotal:true,taxTotal:true}});"
        "const nc=await p.creditNote.count({where:{noteDate:r}});"
        "const nil=await p.invoiceLine.aggregate({where:{gstRatePercent:0,invoice:{invoiceDate:r,status:'ISSUED'}},_sum:{taxableValue:true}});"
        "return {itx:Number(ia._sum.taxableTotal??0),itax:Number(ia._sum.taxTotal??0),icount:ic,ntx:Number(na._sum.taxableTotal??0),ntax:Number(na._sum.taxTotal??0),ncount:nc,nil:Number(nil._sum.taxableValue??0)}"
    )
    su = {x["section"]: x for x in g["summary"]}
    out_tx = su["b2b"]["taxable"] + su["b2cl"]["taxable"] + su["b2cs"]["taxable"] + su["nil"]["taxable"]
    out_tax = su["b2b"]["tax"] + su["b2cl"]["tax"] + su["b2cs"]["tax"]
    cdn_tx = su["cdnr"]["taxable"] + su["cdnur"]["taxable"]
    cdn_tax = su["cdnr"]["tax"] + su["cdnur"]["tax"]
    # B2CS is already net of its notes; B2B/B2CL notes are listed separately.
    b2cs_notes = truth["ntx"] - cdn_tx
    check("taxable: tables = invoices - credit notes (B2CS netted)", abs((out_tx - cdn_tx) - (truth["itx"] - truth["ntx"])) < 0.05,
          (out_tx, cdn_tx, truth))
    check("tax: tables = invoices - credit notes", abs((out_tax - cdn_tax) - (truth["itax"] - truth["ntax"])) < 0.05, (out_tax, cdn_tax, truth))
    docs = {d["doc_num"]: sum(x["totnum"] for x in d["docs"]) for d in g["docIssue"]["doc_det"]}
    check("table 13 counts every invoice and note issued, cancelled included", docs.get(1, 0) == truth["icount"] and docs.get(5, 0) == truth["ncount"], (docs, truth))
    check("counts block matches", g["counts"]["invoices"] == truth["icount"] and g["counts"]["creditNotes"] == truth["ncount"], g["counts"])
    check("portal JSON has the return period and GSTIN", g["gstr1"]["fp"] == month[5:] + month[:4] and g["gstr1"]["gstin"] == g["gstin"], g["gstr1"].get("fp"))
    s, raw = call("GET", f"/gst-returns/gstr1/download?month={month}", token=tok, raw=True)
    check("download -> 200, valid JSON with every table", s == 200 and all(k in json.loads(raw) for k in ("b2b", "b2cl", "b2cs", "cdnr", "cdnur", "nil", "hsn", "doc_issue")), s)
s, b = call("GET", "/gst-returns/gstr1?month=2026-13", token=tok)
check("bad month -> 400", s == 400, b)

step("11. permissions")


def user_token(role):
    email, pw = f"cn-{role.lower()}-{STAMP}@example.com", "E2e@12345"
    _, br = call("GET", "/branches", token=tok)
    br = (br["data"] if isinstance(br, dict) else br)[0]["id"]
    st, u = call("POST", "/users", {"email": email, "password": pw, "fullName": role, "role": role, "branchId": br}, token=tok)
    assert st in (200, 201), u
    st, lg = call("POST", "/auth/login", {"email": email, "password": pw})
    return lg["accessToken"]


bm = user_token("BRANCH_MANAGER")
stt = user_token("SALES_TEAM")
check("Sales team can read credit notes", call("GET", "/credit-notes", token=stt)[0] == 200)
check("Sales team cannot issue one", call("POST", f"/invoices/{inv_id}/credit-notes", {"reason": "SALES_RETURN", "remark": "x x x", "lines": [{"invoiceLineId": line["invoiceLineId"], "amount": 1}]}, token=stt)[0] == 403)
check("Branch Manager cannot cancel one (Super Admin only)", call("POST", f"/credit-notes/{n3['id']}/cancel", {"remark": "nope"}, token=bm)[0] == 403)
check("Branch Manager cannot open GSTR-1 (Super Admin only by default)", call("GET", f"/gst-returns/gstr1?month={month}", token=bm)[0] == 403)

print()
if failures:
    print(f"FAILED: {len(failures)}")
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print("ALL PASSED")
