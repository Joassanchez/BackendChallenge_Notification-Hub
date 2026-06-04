import { config } from "dotenv";
import { resolve } from "path";

// Load .env.test only for local execution; Docker injects DATABASE_URL via compose
if (!process.env.DATABASE_URL) {
  config({ path: resolve(process.cwd(), ".env.test"), quiet: true });
}
