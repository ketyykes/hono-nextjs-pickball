import { describe, it, expect } from "vitest";
import { API_ERROR_CODES } from "../../src/api/errors";

describe("API 錯誤碼契約", () => {
  it("API_ERROR_CODES 恰為五個錯誤碼且值等於鍵名", () => {
    expect(Object.keys(API_ERROR_CODES).sort()).toEqual([
      "ACCOUNT_MISMATCH",
      "INVALID_BODY",
      "PAYLOAD_TOO_LARGE",
      "UNAUTHORIZED",
      "VERSION_CONFLICT",
    ]);
    for (const [key, value] of Object.entries(API_ERROR_CODES)) {
      expect(value).toBe(key);
    }
  });
});
