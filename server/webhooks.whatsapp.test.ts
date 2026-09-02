import { describe, expect, it } from "vitest";
import { verifyWhatsAppWebhook } from "./webhooks.whatsapp";

describe("WhatsApp webhook verification", () => {
  it("accepts the configured Meta verify token", () => {
    const token = process.env.WHATSAPP_VERIFY_TOKEN;
    expect(token).toBeTruthy();

    const req = {
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": token,
        "hub.challenge": "challenge-accepted",
      },
    } as never;
    const response = {
      status: () => response,
      send: (value: string) => value,
      sendStatus: (code: number) => code,
    } as never;

    expect(verifyWhatsAppWebhook(req, response)).toBe("challenge-accepted");
  });
});
