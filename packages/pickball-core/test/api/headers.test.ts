import { describe, it, expect } from "vitest";
import { EXPECTED_USER_ID_HEADER } from "../../src/api/headers";

describe("API 標頭契約", () => {
  it("EXPECTED_USER_ID_HEADER 為 X-Expected-User-Id", () => {
    expect(EXPECTED_USER_ID_HEADER).toBe("X-Expected-User-Id");
  });
});
