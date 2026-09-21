#!/usr/bin/env python3
"""
End-to-end check of storefront login / logout / sessions and the one-time referral rule,
against a RUNNING API (mock OTP).

  customer sign-in (new number creates the customer, existing number is a plain login) ->
  referral honoured ONCE (first verify only) -> retailer signup + login (login never creates,
  never re-applies the referral) -> audience separation -> sessions (logout, logout-all,
  refresh rotation + replay, expiry, multi-device)

Creates its own stamped data; safe to re-run. Temporarily switches the referral reward trigger
to REGISTRATION so the coin credits are observable at signup, and restores it.

  SEED_SUPER_ADMIN_PASSWORD=... python e2e-auth-flow.py
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("BASE_URL", "http://localhost:3000/api/v1")
EMAIL = os.environ.get("SEED_SUPER_ADMIN_EMAIL", "admin@svvbalaji.com")
PASSWORD = os.environ.get("SEED_SUPER_ADMIN_PASSWORD", "admin@123")
STAMP = str(int(time.time()))
HERE = os.path.dirname(os.path.abspath(__file__))
failures = 0
admin = ""


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
        print(f"  FAIL {msg}" + (f"\n       {json.dumps(detail)[:300]}" if detail is not None else ""))
    return ok


def must(method, path, body=None, tok=None, expect=(200, 201)):
    s, d = call(method, path, body, tok)
    if s not in expect:
        print(f"  FATAL {method} {path} -> {s}: {json.dumps(d)[:300]}")
        sys.exit(2)
    return d


def phone(tag):
    return f"9{STAMP[-6:]}{tag:03d}"


def otp(ph, audience=None):
    body = {"phone": ph}
    if audience:
        body["audience"] = audience
    return call("POST", "/storefront/auth/otp/request", body)


def signin(ph, audience="CUSTOMER", **extra):
    s, r = otp(ph, audience)
    if s != 200:
        return s, r
    return call("POST", "/storefront/auth/otp/verify", {"phone": ph, "code": r["devCode"], "audience": audience, **extra})


def balance(tok):
    return must("GET", "/storefront/loyalty", tok=tok)["balance"]


def referral_rows():
    d = must("GET", "/referrals", tok=admin)
    return d["data"] if isinstance(d, dict) and "data" in d else d


def expire_session(session_id):
    js = (
        "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();"
        f"p.customerSession.update({{where:{{id:'{session_id}'}},data:{{expiresAt:new Date(Date.now()-1000)}}}})"
        ".then(()=>p.$disconnect())"
    )
    subprocess.run(["node", "-e", js], cwd=HERE, check=True)


def sid_of(access_token):
    import base64
    payload = access_token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))["sid"]


# ---------------------------------------------------------------------------
step("0. Admin login; make referral rewards observable (trigger REGISTRATION)")
admin = must("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})["accessToken"]
ORIG = must("GET", "/referral-settings", tok=admin)
must("PATCH", "/referral-settings", {"rewardTrigger": "REGISTRATION", "isActive": True, "referrerRewardCoins": 100, "refereeRewardCoins": 50}, tok=admin)

try:
    # -----------------------------------------------------------------------
    step("1. Customer: sign in with a NEW number creates the account (no separate registration)")
    P_REF = phone(1)
    s, r = otp(P_REF, "CUSTOMER")
    check(s == 200 and r["purpose"] == "REGISTRATION", "request says this number is new (UI shows name/referral fields)", r)
    s, ref_sess = call("POST", "/storefront/auth/otp/verify", {"phone": P_REF, "code": r["devCode"], "audience": "CUSTOMER", "fullName": "Referrer One"})
    check(s == 200 and ref_sess["isNewAccount"] is True, "first verify creates the customer", ref_sess if s != 200 else None)
    REF_TOK = ref_sess["accessToken"]
    REF_CODE = ref_sess["account"]["referralCode"]
    check(bool(REF_CODE), "new customer immediately has their own shareable referral code", REF_CODE)
    check(must("GET", "/storefront/auth/me", tok=REF_TOK)["phone"] == P_REF, "session works: /me returns the account")

    # -----------------------------------------------------------------------
    step("2. Referral is honoured exactly once - at the first verify of a new customer")
    ref_before = balance(REF_TOK)
    P_B = phone(2)
    s, b1 = signin(P_B, referralCode=REF_CODE, fullName="Friend B")
    check(s == 200 and b1["isNewAccount"] is True, "new customer created with the referral code", b1 if s != 200 else None)
    B_TOK = b1["accessToken"]
    rows_after_1 = [x for x in referral_rows() if x["referrer"]["id"] == ref_sess["account"]["customerId"]]
    check(len(rows_after_1) == 1, "exactly one Referral row links referrer -> friend B", len(rows_after_1))
    check(balance(REF_TOK) == ref_before + 100, "referrer credited 100 once", (ref_before, balance(REF_TOK)))
    b_bal = balance(B_TOK)
    check(b_bal == 50, "friend B credited the 50 welcome coins once", b_bal)

    s, _ = call("POST", "/storefront/auth/logout", {}, B_TOK)
    check(s == 200, "friend B logs out")

    step("3. Existing customer logging in again: strictly a login, referral never re-processed")
    s, b2 = signin(P_B, referralCode=REF_CODE)
    check(s == 200 and b2["isNewAccount"] is False, "same number signs in as an existing customer (isNewAccount=false)", b2 if s != 200 else None)
    s, b3 = signin(P_B, referralCode="DOESNOTEXIST123")
    check(s == 200 and b3["isNewAccount"] is False, "a bogus referral code on an existing customer is ignored - it does not even fail the login", b3 if s != 200 else None)
    s, _ = signin(P_B, referralCode=must("GET", "/storefront/auth/me", tok=REF_TOK)["referralCode"])
    check(s == 200, "even a fresh valid code on an existing customer is ignored")
    rows_after_2 = [x for x in referral_rows() if x["referrer"]["id"] == ref_sess["account"]["customerId"]]
    check(len(rows_after_2) == 1, "still exactly one Referral row", len(rows_after_2))
    check(balance(REF_TOK) == ref_before + 100, "referrer NOT credited again", balance(REF_TOK))
    check(balance(b3["accessToken"]) == 50, "friend B NOT credited again", balance(b3["accessToken"]))

    step("4. A customer created WITHOUT a code cannot claim one at a later login")
    P_C = phone(3)
    s, c1 = signin(P_C)
    check(s == 200 and c1["isNewAccount"] is True, "customer C created with no referral")
    s, c2 = signin(P_C, referralCode=REF_CODE)
    check(s == 200 and c2["isNewAccount"] is False, "C logs in again supplying a valid code")
    check(len([x for x in referral_rows() if x["referrer"]["id"] == ref_sess["account"]["customerId"]]) == 1, "no Referral row was created for C")
    check(balance(c2["accessToken"]) == 0 and balance(REF_TOK) == ref_before + 100, "no coins moved for C or the referrer")

    # -----------------------------------------------------------------------
    step("5. Audience separation")
    P_R = phone(4)
    s, r = otp(P_R, "RETAILER")
    check(s == 200, "retailer OTP for an unknown number is allowed (needed to register)")
    s, d = call("POST", "/storefront/auth/otp/verify", {"phone": P_R, "code": r["devCode"], "audience": "RETAILER"})
    check(s == 403, "retailer LOGIN on an unknown number is refused - it never creates a customer", (s, d))
    s, d = otp(P_B, "RETAILER")
    check(s == 403, "a customer's number cannot start a retailer sign-in", (s, d))

    # -----------------------------------------------------------------------
    step("6. Retailer: signup (with referral) -> review -> login; login never re-applies the referral")
    ref_bal_before_retailer = balance(REF_TOK)
    s, r = otp(P_R, "RETAILER")
    gst = "27" + "ABCDE" + str(int(STAMP[-4:])).zfill(4) + "F1Z5"
    s, d = call("POST", "/storefront/auth/register-retailer", {
        "phone": P_R, "code": r["devCode"], "fullName": "Retailer Owner", "businessName": f"Kirana {STAMP}",
        "gstin": gst, "addressLine": "Shop 1, Main Market", "city": "Bhopal", "state": "Madhya Pradesh", "pincode": "462016",
        "referralCode": REF_CODE,
    })
    check(s == 200 and d["status"] == "PENDING_APPROVAL", "retailer registration accepted, pending review", (s, d))
    s, d = signin(P_R, "RETAILER")
    check(s == 200 and d.get("pending") is True, "pending retailer gets a pending message, no session", d)
    accounts = must("GET", f"/storefront/accounts?search={P_R}", tok=admin)
    acct = accounts[0] if isinstance(accounts, list) else accounts["data"][0]
    must("PATCH", f"/storefront/accounts/{acct['id']}/approve", {}, tok=admin)
    rr = [x for x in referral_rows() if x["referrer"]["id"] == ref_sess["account"]["customerId"]]
    check(len(rr) == 2, "approval created the retailer's referral relationship (2nd referee overall)", len(rr))
    check(balance(REF_TOK) == ref_bal_before_retailer + 100, "referrer credited once for the retailer", balance(REF_TOK))

    s, ret = signin(P_R, "RETAILER", referralCode=REF_CODE)
    check(s == 200 and ret["account"]["channel"] == "B2B" and ret["isNewAccount"] is False, "approved retailer logs in (login only)", ret if s != 200 else None)
    s, d = call("POST", "/storefront/auth/otp/request", {"phone": P_R, "audience": "CUSTOMER"})
    check(s == 403, "a retailer number cannot use the customer sign-in", (s, d))
    s, ret2 = signin(P_R, "RETAILER", referralCode=REF_CODE)
    rr2 = [x for x in referral_rows() if x["referrer"]["id"] == ref_sess["account"]["customerId"]]
    check(len(rr2) == 2 and balance(REF_TOK) == ref_bal_before_retailer + 100, "retailer login did not process the referral again")

    # -----------------------------------------------------------------------
    step("7. Sessions: logout, multi-device, logout-all, refresh rotation/replay, expiry")
    P_S = phone(5)
    s, d1 = signin(P_S)
    s, d2 = signin(P_S)  # a second device
    check(sid_of(d1["accessToken"]) != sid_of(d2["accessToken"]), "each sign-in creates its own session (two devices)")
    check(call("GET", "/storefront/auth/me", tok=d1["accessToken"])[0] == 200 and call("GET", "/storefront/auth/me", tok=d2["accessToken"])[0] == 200, "both sessions work")

    s, _ = call("POST", "/storefront/auth/logout", {"refreshToken": d1["refreshToken"]}, d1["accessToken"])
    check(s == 200, "logout device 1")
    check(call("GET", "/storefront/auth/me", tok=d1["accessToken"])[0] == 401, "logged-out ACCESS token is rejected immediately (not after it expires)")
    check(call("GET", "/storefront/addresses", tok=d1["accessToken"])[0] == 401, "a protected storefront API rejects it too")
    check(call("POST", "/storefront/auth/refresh", {"refreshToken": d1["refreshToken"]})[0] == 401, "logged-out refresh token cannot mint a new session")
    check(call("GET", "/storefront/auth/me", tok=d2["accessToken"])[0] == 200, "device 2 is unaffected")
    check(call("POST", "/storefront/auth/logout", {"refreshToken": d1["refreshToken"]})[0] == 200, "logout is idempotent")

    s, rot = call("POST", "/storefront/auth/refresh", {"refreshToken": d2["refreshToken"]})
    check(s == 200 and rot["refreshToken"] != d2["refreshToken"] and sid_of(rot["accessToken"]) == sid_of(d2["accessToken"]), "refresh rotates tokens within the same session")
    check(call("GET", "/storefront/auth/me", tok=rot["accessToken"])[0] == 200, "new access token works")
    check(call("POST", "/storefront/auth/refresh", {"refreshToken": d2["refreshToken"]})[0] == 401, "replaying the OLD refresh token is refused...")
    check(call("GET", "/storefront/auth/me", tok=rot["accessToken"])[0] == 401, "...and ends the whole session (possible token theft)")

    s, e1 = signin(P_S)
    expire_session(sid_of(e1["accessToken"]))
    check(call("GET", "/storefront/auth/me", tok=e1["accessToken"])[0] == 401, "an EXPIRED session is rejected even with a valid-looking token")
    check(call("POST", "/storefront/auth/refresh", {"refreshToken": e1["refreshToken"]})[0] == 401, "an expired session cannot be refreshed")

    P_S2 = phone(6)
    s, x1 = signin(P_S2)
    s, x2 = signin(P_S2)
    s, la = call("POST", "/storefront/auth/logout-all", {}, x1["accessToken"])
    check(s == 200 and la["sessionsEnded"] >= 2, "logout-all ends every device", la)
    check(call("GET", "/storefront/auth/me", tok=x1["accessToken"])[0] == 401 and call("GET", "/storefront/auth/me", tok=x2["accessToken"])[0] == 401, "all tokens rejected after logout-all")

    check(call("GET", "/storefront/auth/me")[0] == 401, "no token -> 401")
    check(call("GET", "/storefront/auth/me", tok=admin)[0] == 401, "a staff token is not a customer session")

    s, again = signin(P_S2)
    check(s == 200 and again["isNewAccount"] is False, "after logout the customer can sign in again (a new session)")

finally:
    must("PATCH", "/referral-settings", {
        "rewardTrigger": ORIG["rewardTrigger"], "isActive": ORIG["isActive"],
        "referrerRewardCoins": ORIG["referrerRewardCoins"], "refereeRewardCoins": ORIG["refereeRewardCoins"],
    }, tok=admin)

print(f"\n  Failed checks: {failures}")
sys.exit(1 if failures else 0)
