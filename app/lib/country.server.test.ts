import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the session module
const mockSession = new Map<string, string>();
vi.mock("~/lib/session", () => ({
  getSession: vi.fn(async () => ({
    get: (key: string) => mockSession.get(key),
  })),
}));

// Country resolution must never go to the network.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { resolveCountry } from "./country.server";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000", { headers });
}

describe("resolveCountry", () => {
  beforeEach(() => {
    mockSession.clear();
    mockFetch.mockReset();
  });

  // ─── Priority Ordering ───

  it("uses dev session override first", async () => {
    mockSession.set("devCountry", "IN");
    const result = await resolveCountry(
      makeRequest({ "CF-IPCountry": "US", "X-Forwarded-For": "1.2.3.4" })
    );
    expect(result).toBe("IN");
  });

  it("falls back to CF-IPCountry when no dev override", async () => {
    const result = await resolveCountry(makeRequest({ "CF-IPCountry": "BR" }));
    expect(result).toBe("BR");
  });

  it("returns null without a dev override or CF header, even with an IP", async () => {
    const result = await resolveCountry(
      makeRequest({ "X-Forwarded-For": "1.2.3.4" })
    );
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null when all methods fail", async () => {
    const result = await resolveCountry(makeRequest());
    expect(result).toBeNull();
  });

  // ─── Dev Override Behavior ───

  it("normalizes dev country to uppercase", async () => {
    mockSession.set("devCountry", "pl");
    const result = await resolveCountry(makeRequest());
    expect(result).toBe("PL");
  });

  it("ignores dev country if not exactly 2 characters", async () => {
    mockSession.set("devCountry", "USA");
    const result = await resolveCountry(makeRequest());
    expect(result).toBeNull();
  });

  // ─── CF-IPCountry Behavior ───

  it("normalizes CF-IPCountry to uppercase", async () => {
    const result = await resolveCountry(makeRequest({ "CF-IPCountry": "de" }));
    expect(result).toBe("DE");
  });

  it("ignores CF-IPCountry when value is XX", async () => {
    const result = await resolveCountry(makeRequest({ "CF-IPCountry": "XX" }));
    expect(result).toBeNull();
  });

  it("ignores X-Forwarded-For entirely", async () => {
    const result = await resolveCountry(
      makeRequest({ "X-Forwarded-For": "1.2.3.4, 5.6.7.8" })
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
