import { existsSync } from "fs";
import { config as dotenvConfig } from "dotenv";
import { defineConfig } from "prisma/config";

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.local";

if (existsSync(envFile)) {
  dotenvConfig({ path: envFile });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
