import { config } from "dotenv";
import { execSync } from "child_process";

// Load .env.test with override before any Prisma command
config({ path: ".env.test", override: true });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Ensure .env.test exists with DATABASE_URL.");
  process.exit(1);
}

console.log(`Migrating test database: ${process.env.DATABASE_URL}`);

// Run prisma migrate deploy in the same process (inherits env vars)
execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: process.env,
});
