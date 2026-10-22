import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  versionedEnvelopeSchema,
  versionedWriteSchema,
} from "../../src/api/versioned";

const dataSchema = z.object({ n: z.number() });

describe("版本化讀寫契約 schema", () => {
  it("versionedEnvelopeSchema 接受 data null 與非負整數 version", () => {
    const schema = versionedEnvelopeSchema(dataSchema);

    expect(schema.safeParse({ data: null, version: 0 }).success).toBe(true);
    expect(schema.safeParse({ data: { n: 1 }, version: 3 }).success).toBe(true);
    expect(schema.safeParse({ data: null, version: -1 }).success).toBe(false);
    expect(schema.safeParse({ data: null, version: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ data: { n: "x" }, version: 1 }).success).toBe(false);
  });

  it("versionedWriteSchema 拒絕 null data 與負數或非整數 version", () => {
    const schema = versionedWriteSchema(dataSchema);

    expect(schema.safeParse({ data: { n: 1 }, version: 0 }).success).toBe(true);
    expect(schema.safeParse({ data: { n: 1 }, version: 7 }).success).toBe(true);
    expect(schema.safeParse({ data: null, version: 0 }).success).toBe(false);
    expect(schema.safeParse({ data: { n: 1 }, version: -1 }).success).toBe(false);
    expect(schema.safeParse({ data: { n: 1 }, version: 1.5 }).success).toBe(false);
  });
});
