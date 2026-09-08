import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertOwnerIdentity } from "./routers/owner";

describe("owner console authorization", () => {
  it("accepts only the configured owner with admin role", () => {
    expect(() => assertOwnerIdentity({ role: "admin", openId: "owner-1" }, "owner-1")).not.toThrow();
  });

  it("rejects regular admins, organization owners and mismatched identities", () => {
    for (const user of [
      { role: "user", openId: "owner-1" },
      { role: "admin", openId: "another-user" },
      { role: "owner", openId: "owner-1" },
      null,
    ]) {
      expect(() => assertOwnerIdentity(user, "owner-1")).toThrowError(TRPCError);
    }
  });

  it("rejects when the owner identity is not configured", () => {
    expect(() => assertOwnerIdentity({ role: "admin", openId: "owner-1" }, "")).toThrowError(TRPCError);
  });
});
