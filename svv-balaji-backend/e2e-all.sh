#!/usr/bin/env bash
# Runs every end-to-end scenario against a RUNNING API, then reconciles the database.
# Non-zero exit if any scenario fails or any cross-module invariant is broken.
#
#   SEED_SUPER_ADMIN_PASSWORD=... ./e2e-all.sh
#
# Needs: API on :3000 (PAYMENT_GATEWAY=mock, SHIPPING_PROVIDER=mock, SHIPROCKET_WEBHOOK_TOKEN set),
# python3, node. The checkout scenario waits ~1 minute for a stock hold to expire.
set -uo pipefail
cd "$(dirname "$0")"
export PYTHONIOENCODING=utf-8
status=0
for s in e2e-auth-flow.py e2e-recall-flow.py e2e-loyalty-flow.py e2e-checkout-flow.py; do
  echo "=== $s"
  python "$s" | tail -4 || status=1
  [ "${PIPESTATUS[0]}" -eq 0 ] || status=1
done
echo "=== e2e-reconcile.mjs (cross-module invariants)"
node e2e-reconcile.mjs | tail -6 || status=1
[ "${PIPESTATUS[0]}" -eq 0 ] || status=1
exit $status
