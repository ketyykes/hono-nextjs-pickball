import { defineConfig } from "drizzle-kit";

// generate 只比對 schema 與既有 snapshot，不連資料庫，
// 因此不設 driver／dbCredentials（避免誤碰遠端 D1）
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
