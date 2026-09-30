import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CUSTOMER_PUSH_TOKEN_KEY,
  customerPushTokenStorage,
} from "./pushTokenStorage";

describe("customerPushTokenStorage", () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("persists and removes the FCM token under the customer-only key", () => {
    customerPushTokenStorage.set("customer-fcm-token");

    expect(customerPushTokenStorage.get()).toBe("customer-fcm-token");
    expect(values.get(CUSTOMER_PUSH_TOKEN_KEY)).toBe("customer-fcm-token");
    expect(values.has("svv.push.token")).toBe(false);

    customerPushTokenStorage.set(null);
    expect(customerPushTokenStorage.get()).toBeNull();
  });
});
