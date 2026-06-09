import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// 每個測試後自動清理 DOM
afterEach(() => {
	cleanup();
});
