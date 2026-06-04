import type { PrismaClient } from "../../src/generated/prisma/client.js";

const CLEANUP_SQL = `TRUNCATE TABLE
  delivery_attempts,
  message_deliveries,
  messages,
  notification_targets,
  provider_connections,
  daily_usage,
  audit_logs,
  user_roles,
  users
RESTART IDENTITY CASCADE`;

/**
 * Atomically truncates all transactional tables using PostgreSQL TRUNCATE.
 * Preserves seed data: providers, roles.
 *
 * Guards:
 * - Primary: throws unless NODE_ENV=test OR VITEST is set
 * - Secondary: throws unless DATABASE_URL contains "_test"
 *
 * Call in beforeEach() to ensure test isolation.
 */
export async function cleanTransactionalData(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    throw new Error(
      "cleanTransactionalData must only run in test environment. " +
      "Set NODE_ENV=test or run via Vitest."
    );
  }

  if (!process.env.DATABASE_URL?.includes("_test")) {
    throw new Error(
      "cleanTransactionalData requires a test database. " +
      "DATABASE_URL must contain '_test'."
    );
  }

  await prisma.$queryRawUnsafe(CLEANUP_SQL);
}
