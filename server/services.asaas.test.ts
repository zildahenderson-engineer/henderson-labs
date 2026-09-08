import { afterEach, describe, expect, it } from "vitest";
import { asaasConfiguration, verifyAsaasWebhook } from "./services.asaas";

const originalApiKey = process.env.ASAAS_API_KEY;
const originalWebhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
const originalEnvironment = process.env.ASAAS_ENV;

afterEach(() => {
  process.env.ASAAS_API_KEY = originalApiKey;
  process.env.ASAAS_WEBHOOK_TOKEN = originalWebhookToken;
  process.env.ASAAS_ENV = originalEnvironment;
});

describe("Asaas integration", () => {
  it("rejects missing, mismatched and malformed webhook tokens", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = "token-seguro-123456789012345678901234";
    expect(verifyAsaasWebhook(undefined)).toBe(false);
    expect(verifyAsaasWebhook("outro-token")).toBe(false);
    expect(verifyAsaasWebhook("token-seguro-123456789012345678901234-extra")).toBe(false);
  });

  it("accepts the configured token and defaults to sandbox", () => {
    process.env.ASAAS_API_KEY = "sandbox-key";
    process.env.ASAAS_WEBHOOK_TOKEN = "token-seguro-123456789012345678901234";
    delete process.env.ASAAS_ENV;
    expect(verifyAsaasWebhook(process.env.ASAAS_WEBHOOK_TOKEN)).toBe(true);
    expect(asaasConfiguration()).toEqual({ configured: true, environment: "sandbox" });
  });

  it("never reports configured without both server-side secrets", () => {
    delete process.env.ASAAS_API_KEY;
    process.env.ASAAS_WEBHOOK_TOKEN = "token-seguro-123456789012345678901234";
    expect(asaasConfiguration().configured).toBe(false);
  });
});
