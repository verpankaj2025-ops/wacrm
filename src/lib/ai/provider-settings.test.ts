import { describe, expect, it } from "vitest";
import { isAIProvider, toPublicAISettings } from "./provider-settings";

describe("AI provider settings", () => {
  it("accepts only supported providers", () => {
    expect(isAIProvider("gemini")).toBe(true);
    expect(isAIProvider("openai")).toBe(true);
    expect(isAIProvider("anthropic")).toBe(false);
  });

  it("never exposes encrypted credential material", () => {
    const result = toPublicAISettings({
      provider: "openai", model: "gpt-4o-mini",
      custom_instructions: "Short replies", business_knowledge: "Verified prices",
      api_key_encrypted: "encrypted-secret-value", api_key_last4: "abcd",
    });
    expect(result.hasApiKey).toBe(true);
    expect(result.apiKeyLast4).toBe("abcd");
    expect(JSON.stringify(result)).not.toContain("encrypted-secret-value");
    expect(Object.keys(result)).not.toContain("api_key_encrypted");
  });

  it("uses Gemini defaults when there is no saved row", () => {
    const result = toPublicAISettings(null);
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-2.5-flash");
  });
});
