import { describe, expect, it } from "vitest";
import { publicTrainingSettings } from "./training.service";

describe("AI training settings", () => {
  it("never returns encrypted key material", () => {
    const result = publicTrainingSettings({provider:"openai",model:"gpt-4o-mini",custom_instructions:"Be brief",api_key_encrypted:"ciphertext-secret",api_key_last4:"abcd"}, "Rates");
    expect(result.hasApiKey).toBe(true);
    expect(result.apiKeyLast4).toBe("abcd");
    expect(JSON.stringify(result)).not.toContain("ciphertext-secret");
  });
  it("uses safe defaults for absent settings", () => {
    const result = publicTrainingSettings(null, "");
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-2.5-flash");
    expect(result.hasApiKey).toBe(Boolean(process.env.GEMINI_API_KEY));
  });
});
