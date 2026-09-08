import { describe, expect, it } from "vitest";
import { verifyOfficialWhatsAppCredentials } from "./services.whatsapp";

describe("WhatsApp Cloud API credentials", () => {
  it.skip("validates the configured phone number without sending a message (manual integration check)", async () => {
    expect(process.env.WHATSAPP_ACCESS_TOKEN).toBeTruthy();
    expect(process.env.WHATSAPP_PHONE_NUMBER_ID).toBeTruthy();

    const result = await verifyOfficialWhatsAppCredentials();

    expect(result.ok).toBe(true);
    expect(result.phoneNumberId).toBe(process.env.WHATSAPP_PHONE_NUMBER_ID);
  }, 20_000);
});
