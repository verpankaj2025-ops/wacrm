import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { get, exchange } = vi.hoisted(() => ({ get: vi.fn(), exchange: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: exchange } }),
}));

const callback = () => new NextRequest("https://crm.example/auth/recovery?code=example");

describe("password recovery callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    get.mockReturnValue({ value: "1" });
  });

  it("opens the password form after a successful recovery exchange", async () => {
    exchange.mockResolvedValue({ data: { user: { id: "test-user" } }, error: null });
    const response = await GET(callback());
    expect(response.headers.get("location")).toBe("https://crm.example/reset-password");
    expect(response.cookies.get("relaxio-recovery-user")?.value).toBe("test-user");
  });

  it("rejects an email link opened outside the requesting browser", async () => {
    get.mockReturnValue(undefined);
    const response = await GET(callback());
    expect(response.headers.get("location")).toBe("https://crm.example/forgot-password?expired=1");
    expect(exchange).not.toHaveBeenCalled();
  });

  it("rejects a failed code exchange without granting recovery access", async () => {
    exchange.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    const response = await GET(callback());
    expect(response.headers.get("location")).toBe("https://crm.example/forgot-password?expired=1");
    expect(response.cookies.has("relaxio-recovery-user")).toBe(false);
  });
});
