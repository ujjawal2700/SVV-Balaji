#!/usr/bin/env python3
"""
End-to-end check of RIDER ONBOARDING against a RUNNING API (mock OTP,
PAYMENT_GATEWAY=mock). Run it against a throwaway database - it changes the
delivery settings and document rules, and leaves a test rider behind.

  sign-up -> checklist shows every mandatory document incl. the PCC; approval
     refused while anything is missing (400 NOT_VERIFIED, says what)
  -> documents: field rules (number / expiry / police station), expired
     upload refused; staff reject with a reason -> rider sees it, re-uploads
     (old upload superseded, kept in history) -> approve
  -> PCC: built in, always mandatory, cannot be made optional or switched off
  -> security deposit: Super Admin turns the rule on -> every rider re-checked;
     rider pays part online (mock gateway; replayed verify credits once;
     over-paying refused), staff record the rest in cash -> PAID
  -> only now can staff approve -> ACTIVE -> rider can go online
  -> gate lapses: staff withdraw the PCC approval -> rider taken offline,
     cannot go online, dispatch board says "Verification incomplete";
     re-upload + approve restores it
  -> deposit refund below the requirement lapses it again; refund > paid refused
  -> a new mandatory document type blocks every rider until uploaded

  SEED_SUPER_ADMIN_PASSWORD=... BASE_URL=http://localhost:3110/api/v1 python e2e-rider-onboarding-flow.py
"""
import json
import os
import time
import urllib.error
import urllib.request

BASE = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
EMAIL = os.environ.get("SEED_SUPER_ADMIN_EMAIL", "admin@svvbalaji.com")
PASSWORD = os.environ.get("SEED_SUPER_ADMIN_PASSWORD", "admin@123")
STAMP = str(int(time.time()))
failures = 0
token = ""


def call(method, path, body=None, tok=None, auth=True, raw=None, ctype="application/json"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", ctype)
    t = tok or (token if auth else None)
    if t and t != "-":
        req.add_header("Authorization", f"Bearer {t}")
    try:
        with urllib.request.urlopen(req) as res:
            txt = res.read().decode()
            return res.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except ValueError:
            return e.code, txt


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


def multipart(field, filename, content, mime):
    boundary = f"----svv{STAMP}"
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\nContent-Type: {mime}\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


token = must("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD}, tok="-")["accessToken"]
ORIG_DS = must("GET", "/delivery/settings")
BR = rows(must("GET", "/branches"))[0]["id"]
OUTLET_LL = (23.2599, 77.4126)
NEW_TYPE = None

try:
    step("0. Outlet; deposit rule off to start")
    WH_O = must("POST", "/warehouses", {"name": f"OB Outlet {STAMP}", "location": "MP Nagar, Bhopal", "branchId": BR, "capacity": 5000, "kind": "OUTLET",
                                        "city": "Bhopal", "state": "Madhya Pradesh", "latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1], "serviceRadiusKm": 5})["id"]
    must("PATCH", "/delivery/settings", {"securityDepositRequired": False, "securityDepositAmount": 0})

    step("1. Sign-up: checklist, approval refused")
    phone = f"6{STAMP[-6:]}321"
    r = must("POST", "/rider/auth/signup", {"fullName": "Onboarding Rider", "phone": phone, "password": "Secret#123", "vehicleType": "MOTORCYCLE", "vehicleNumber": "mp04 ob 1"}, tok="-")
    sess = must("POST", "/rider/auth/verify", {"phone": phone, "code": r["devCode"]}, tok="-")
    RT, RID = sess["accessToken"], sess["rider"]["id"]
    check(sess["rider"]["verified"] is False, "a new rider is not verified")
    v = must("GET", "/rider/verification", tok=RT)
    codes = {d["type"]["code"]: d for d in v["documents"]}
    check(not v["eligible"] and {"DRIVING_LICENCE", "ID_PROOF", "PCC"} <= set(codes), "checklist lists the mandatory documents", v["missing"])
    check(v["pcc"] and v["pcc"]["mandatory"] and v["pcc"]["state"] == "NOT_UPLOADED", "PCC is its own mandatory item", v["pcc"])
    check(codes.get("VEHICLE_RC", {}).get("mandatory") is False, "vehicle RC is optional by default")
    check(v["deposit"]["status"] == "NOT_REQUIRED", "no deposit while the rule is off", v["deposit"])
    s, bad = call("POST", f"/riders/{RID}/approve", {"warehouseId": WH_O})
    check(s == 400 and bad.get("code") == "NOT_VERIFIED" and any("Police Clearance" in m for m in bad.get("missing", [])), "approval refused, listing what is missing", bad)
    s, bad = call("POST", "/rider/availability", {"online": True}, tok=RT)
    check(s == 403, "a pending rider cannot go online", bad)

    step("2. Uploads: file type, field rules")
    raw, ct = multipart("file", "note.txt", b"hello", "text/plain")
    s, bad = call("POST", "/rider/verification/files", tok=RT, raw=raw, ctype=ct)
    check(s == 400, "a non-image / non-PDF file is refused", bad)
    png = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000" "1f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f00000000049454e44ae426082")
    raw, ct = multipart("file", "dl.png", png, "image/png")
    s, up = call("POST", "/rider/verification/files", tok=RT, raw=raw, ctype=ct)
    if s in (200, 201) and isinstance(up, dict) and up.get("url"):
        check(True, "a photo uploads to storage")
        FILE = up["url"]
    else:
        print(f"  NOTE storage upload unavailable here ({s}) - using a placeholder url for the rest")
        FILE = "https://example.com/dl-front.jpg"
    DL = codes["DRIVING_LICENCE"]["type"]["id"]
    s, bad = call("POST", "/rider/verification/documents", {"typeId": DL, "fileUrls": [FILE], "expiresOn": "2031-01-01"}, tok=RT)
    check(s == 400 and "number" in json.dumps(bad).lower(), "licence number required", bad)
    s, bad = call("POST", "/rider/verification/documents", {"typeId": DL, "fileUrls": [FILE], "documentNumber": "MP04-2019-1"}, tok=RT)
    check(s == 400 and "expiry" in json.dumps(bad).lower(), "licence expiry required", bad)
    s, bad = call("POST", "/rider/verification/documents", {"typeId": DL, "fileUrls": [FILE], "documentNumber": "MP04-2019-1", "expiresOn": "2020-01-01"}, tok=RT)
    check(s == 400 and "expired" in json.dumps(bad).lower(), "an expired licence is refused", bad)
    s, bad = call("POST", "/rider/verification/documents", {"typeId": DL, "fileUrls": ["javascript:alert(1)"], "documentNumber": "X1", "expiresOn": "2031-01-01"}, tok=RT)
    check(s == 400, "a non-http file url is refused", bad)
    d1 = must("POST", "/rider/verification/documents", {"typeId": DL, "fileUrls": [FILE], "documentNumber": "mp04-2019-1", "expiresOn": "2031-01-01"}, tok=RT)
    check(d1["status"] == "PENDING" and d1["documentNumber"] == "MP04-2019-1", "licence sent for review (number upper-cased)", d1)
    q = must("GET", "/riders/verification-queue")
    check(any(x["id"] == d1["id"] and x["rider"]["id"] == RID for x in q), "it shows in the staff review queue")

    step("3. Reject with a reason -> rider re-uploads -> approve")
    must("POST", f"/riders/documents/{d1['id']}/reject", {"reason": "Photo is blurred - number not readable"})
    v = must("GET", "/rider/verification", tok=RT)
    dl = next(d for d in v["documents"] if d["type"]["code"] == "DRIVING_LICENCE")
    check(dl["state"] == "REJECTED" and dl["current"]["rejectionReason"].startswith("Photo is blurred") and dl["canUpload"], "rider sees REJECTED with the reason and may re-upload", dl)
    inbox = must("GET", "/rider/notifications", tok=RT)
    check(any(n["type"] == "VERIFICATION" and "rejected" in n["title"].lower() for n in inbox), "rider notified of the rejection")
    s, bad = call("POST", f"/riders/documents/{d1['id']}/approve", {})
    check(s == 409, "a rejected upload cannot then be approved", bad)
    d2 = must("POST", "/rider/verification/documents", {"typeId": DL, "fileUrls": [FILE, FILE + "?back"], "documentNumber": "MP04-2019-1", "expiresOn": "2031-01-01"}, tok=RT)
    hist = must("GET", f"/riders/{RID}/verification")["history"]
    old = next(h for h in hist if h["id"] == d1["id"])
    check(old["supersededAt"] and old["status"] == "REJECTED" and len([h for h in hist if h["type"]["code"] == "DRIVING_LICENCE"]) == 2, "old upload kept in history, superseded", hist)
    must("POST", f"/riders/documents/{d2['id']}/approve", {"note": "Checked against original"})
    s, bad = call("POST", "/rider/verification/documents", {"typeId": DL, "fileUrls": [FILE], "documentNumber": "MP04-2019-1", "expiresOn": "2031-01-01"}, tok=RT)
    check(s == 409, "an approved licence far from expiry cannot be replaced by the rider", bad)
    ID = codes["ID_PROOF"]["type"]["id"]
    d3 = must("POST", "/rider/verification/documents", {"typeId": ID, "fileUrls": [FILE], "documentNumber": "1234 5678 9012"}, tok=RT)
    must("POST", f"/riders/documents/{d3['id']}/approve", {})
    v = must("GET", "/rider/verification", tok=RT)
    check(not v["eligible"] and v["missing"] == ["Police Clearance Certificate: not uploaded"], "only the PCC is left", v["missing"])
    s, bad = call("POST", f"/riders/{RID}/approve", {"warehouseId": WH_O})
    check(s == 400 and "Police Clearance" in bad.get("message", ""), "still cannot approve without the PCC", bad)

    step("4. PCC")
    PCC = v["pcc"]["type"]["id"]
    s, bad = call("POST", "/rider/verification/documents", {"typeId": PCC, "fileUrls": [FILE], "documentNumber": "PCC/2026/77", "issuedOn": "2026-09-01"}, tok=RT)
    check(s == 400 and "police station" in json.dumps(bad).lower(), "PCC needs the issuing police station", bad)
    s, bad = call("POST", "/rider/verification/documents", {"typeId": PCC, "fileUrls": [FILE], "documentNumber": "PCC/2026/77", "issuedBy": "MP Nagar PS", "issuedOn": "2099-01-01"}, tok=RT)
    check(s == 400 and "future" in json.dumps(bad).lower(), "PCC issue date cannot be in the future", bad)
    p1 = must("POST", "/rider/verification/documents", {"typeId": PCC, "fileUrls": [FILE], "documentNumber": "PCC/2026/77", "issuedBy": "MP Nagar PS", "issuedOn": "2026-09-01"}, tok=RT)
    must("POST", f"/riders/documents/{p1['id']}/approve", {"note": "Confirmed with MP Nagar PS by phone"})
    v = must("GET", "/rider/verification", tok=RT)
    check(v["eligible"] and v["pcc"]["state"] == "APPROVED" and v["pcc"]["current"]["issuedBy"] == "MP Nagar PS", "PCC approved with its details; rider verified", v)
    types = must("GET", "/riders/document-types")
    pcc_type = next(t for t in types if t["code"] == "PCC")
    s, bad = call("PATCH", f"/riders/document-types/{pcc_type['id']}", {"isMandatory": False})
    check(s == 400, "PCC cannot be made optional", bad)
    s, bad = call("PATCH", f"/riders/document-types/{pcc_type['id']}", {"isActive": False})
    check(s == 400, "PCC cannot be switched off", bad)

    step("5. Security deposit rule on -> partial online + cash")
    must("PATCH", "/delivery/settings", {"securityDepositRequired": True, "securityDepositAmount": 1000})
    v = must("GET", "/rider/verification", tok=RT)
    check(not v["eligible"] and v["deposit"]["status"] == "NOT_PAID" and v["deposit"]["pending"] == 1000, "rule on: rider no longer eligible, 1000 pending", v["deposit"])
    s, bad = call("POST", f"/riders/{RID}/approve", {"warehouseId": WH_O})
    check(s == 400 and "deposit" in bad.get("message", "").lower(), "approval refused until the deposit is paid", bad)
    s, bad = call("POST", "/rider/deposit/pay-order", {"amount": 1500}, tok=RT)
    check(s == 400, "cannot pay more than is pending", bad)
    o = must("POST", "/rider/deposit/pay-order", {"amount": 400}, tok=RT)
    check(o["amount"] == 400, "online payment order for 400")
    s, bad = call("POST", "/rider/deposit/pay-verify", {"gatewayOrderId": o["gatewayOrderId"], "paymentId": f"mockfail_{STAMP}", "signature": "x"}, tok=RT)
    check(s == 400, "a declined / unsigned payment credits nothing", bad)
    pid = f"mockpay_{STAMP}"
    pv = must("POST", "/rider/deposit/pay-verify", {"gatewayOrderId": o["gatewayOrderId"], "paymentId": pid, "signature": "mock_signature"}, tok=RT)
    check(pv["deposit"]["paid"] == 400 and pv["deposit"]["status"] == "PARTIALLY_PAID" and pv["deposit"]["pending"] == 600, "400 paid online: partly paid, 600 pending", pv["deposit"])
    again = must("POST", "/rider/deposit/pay-verify", {"gatewayOrderId": o["gatewayOrderId"], "paymentId": pid, "signature": "mock_signature"}, tok=RT)
    check(again["duplicate"] and again["deposit"]["paid"] == 400, "replayed verify credits once", again)
    s, bad = call("POST", f"/riders/{RID}/deposit/entries", {"type": "REFUND", "amount": 50})
    check(s == 400 and "note" in json.dumps(bad).lower(), "a refund needs a note", bad)
    dep = must("POST", f"/riders/{RID}/deposit/entries", {"type": "PAYMENT", "amount": 600, "method": "CASH", "reference": "RCPT-1"})
    check(dep["status"] == "PAID" and dep["paid"] == 1000 and len(dep["entries"]) == 2, "600 cash recorded by staff -> PAID, ledger has both", dep)
    me = must("GET", "/rider/deposit", tok=RT)
    check(me["entries"][0]["recordedBy"] and any(e["online"] for e in me["entries"]), "rider sees both entries (online + staff)", me["entries"])

    step("6. Approve -> ACTIVE -> online")
    a = must("POST", f"/riders/{RID}/approve", {"warehouseId": WH_O})
    check(a["status"] == "ACTIVE" and a["isVerified"] is True, "approved now that everything is cleared", a)
    must("POST", "/rider/availability", {"online": True, "latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1]}, tok=RT)
    dash = must("GET", "/rider/dashboard", tok=RT)
    check(dash["rider"]["availability"] == "ONLINE" and dash["rider"]["verified"] is True, "rider online and verified", dash["rider"])
    lst = must("GET", "/riders?q=Onboarding")
    row = next(x for x in lst if x["id"] == RID)
    check(row["verified"] is True and row["depositPaid"] == 1000 and row["documentsToReview"] == 0, "riders list shows verified, deposit and nothing to review", row)

    step("7. Gate lapses when the PCC approval is withdrawn")
    must("POST", f"/riders/documents/{p1['id']}/reject", {"reason": "Police station could not confirm this certificate"})
    dash = must("GET", "/rider/dashboard", tok=RT)
    check(dash["rider"]["availability"] == "OFFLINE" and dash["rider"]["verified"] is False, "rider taken offline, not verified", dash["rider"])
    s, bad = call("POST", "/rider/availability", {"online": True}, tok=RT)
    check(s == 403 and bad.get("code") == "NOT_VERIFIED", "cannot go online again", bad)
    board = must("GET", f"/delivery/availability?warehouseId={WH_O}")
    me_row = next((x for o2 in (board.get("outlets") if isinstance(board, dict) else board) for x in o2["riders"] if x["id"] == RID), None)
    check(me_row and "Verification incomplete" in me_row["reasons"], "delivery board says why", me_row)
    p2 = must("POST", "/rider/verification/documents", {"typeId": PCC, "fileUrls": [FILE], "documentNumber": "PCC/2026/91", "issuedBy": "MP Nagar PS", "issuedOn": "2026-10-01"}, tok=RT)
    must("POST", f"/riders/documents/{p2['id']}/approve", {})
    must("POST", "/rider/availability", {"online": True, "latitude": OUTLET_LL[0], "longitude": OUTLET_LL[1]}, tok=RT)
    check(True, "new PCC approved -> can go online again")

    step("8. Deposit refund lapses it; over-refund refused")
    s, bad = call("POST", f"/riders/{RID}/deposit/entries", {"type": "REFUND", "amount": 1500, "method": "UPI", "note": "Leaving"})
    check(s == 400, "cannot refund more than was paid", bad)
    dep = must("POST", f"/riders/{RID}/deposit/entries", {"type": "FORFEIT", "amount": 200, "note": "Damaged delivery bag"})
    check(dep["paid"] == 800 and dep["status"] == "PARTIALLY_PAID", "200 kept for damage -> 800 on deposit, partly paid", dep)
    dash = must("GET", "/rider/dashboard", tok=RT)
    check(dash["rider"]["availability"] == "OFFLINE" and dash["rider"]["verified"] is False, "rider taken offline until topped up", dash["rider"])
    must("POST", f"/riders/{RID}/deposit/entries", {"type": "PAYMENT", "amount": 200, "method": "UPI", "reference": "UTR123"})
    must("POST", "/rider/availability", {"online": True}, tok=RT)
    check(True, "topped up -> online again")

    step("9. A new mandatory document blocks everyone until uploaded")
    NEW_TYPE = must("POST", "/riders/document-types", {"code": f"BAG{STAMP[-4:]}", "name": "Delivery bag photo", "isMandatory": True, "requiresNumber": False})
    v = must("GET", "/rider/verification", tok=RT)
    check(not v["eligible"] and any("Delivery bag photo" in m for m in v["missing"]), "new mandatory type -> not verified", v["missing"])
    must("PATCH", f"/riders/document-types/{NEW_TYPE['id']}", {"isMandatory": False})
    v = must("GET", "/rider/verification", tok=RT)
    check(v["eligible"], "made optional -> verified again", v["missing"])
finally:
    step("Clean-up")
    if NEW_TYPE:
        call("PATCH", f"/riders/document-types/{NEW_TYPE['id']}", {"isActive": False, "isMandatory": False})
    call("PATCH", "/delivery/settings", {"securityDepositRequired": ORIG_DS.get("securityDepositRequired", False), "securityDepositAmount": float(ORIG_DS.get("securityDepositAmount") or 0)})
    print("  settings restored")

print(f"\n{'ALL PASS' if failures == 0 else f'{failures} FAILURE(S)'}")
raise SystemExit(1 if failures else 0)
