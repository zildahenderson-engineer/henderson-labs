import { afterEach, describe, expect, it } from "vitest";
import { WhatsAppNotConfiguredError, sendOfficialWhatsAppTemplate, whatsappConfiguration } from "./services.whatsapp";

const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

afterEach(() => {
  if (originalToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
  else process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
  if (originalPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
});

describe("WhatsApp official adapter", () => {
  it("reports that the integration is not configured without server credentials", () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    expect(whatsappConfiguration().configured).toBe(false);
  });

  it("never attempts a send when credentials are missing", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    await expect(sendOfficialWhatsAppTemplate({ to: "+5511999999999", templateName: "hello_world" })).rejects.toBeInstanceOf(WhatsAppNotConfiguredError);
  });
});
