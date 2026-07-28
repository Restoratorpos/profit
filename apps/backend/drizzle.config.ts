import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside the app, so it loads env itself rather than through
// src/env.ts (which would exit the process over unrelated missing vars).
config({ path: [".env.local", ".env"] });

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: process.env.DB_HOST ?? "",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "",
  },
});
