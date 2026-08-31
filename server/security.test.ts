import { describe, expect, it } from "vitest";
import { sameOriginMutation } from "./_core/security";

function request(headers: Record<string, string>): Parameters<typeof sameOriginMutation>[0] {
  return { method: "POST", headers } as Parameters<typeof sameOriginMutation>[0];
}

describe("sameOriginMutation", () => {
  it("allows a same-origin cookie mutation", () => {
    expect(sameOriginMutation(request({
      cookie: "app_session_id=session",
      origin: "https://app.example.com",
      host: "app.example.com",
    }))).toBe(true);
  });

  it("rejects a cross-origin cookie mutation", () => {
    expect(sameOriginMutation(request({
      cookie: "app_session_id=session",
      origin: "https://attacker.example",
      host: "app.example.com",
    }))).toBe(false);
  });

  it("rejects a cookie mutation without an origin", () => {
    expect(sameOriginMutation(request({
      cookie: "app_session_id=session",
      host: "app.example.com",
    }))).toBe(false);
  });

  it("allows bearer requests without ambient cookies", () => {
    expect(sameOriginMutation(request({
      authorization: "Bearer preview-session",
      origin: "https://attacker.example",
      host: "app.example.com",
    }))).toBe(true);
  });
});
