import { describe, expect, it, vi } from "vitest";
import { cleanTransactionalData } from "./db-cleanup.js";

function mockPrisma() {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue(undefined),
  };
}

describe("cleanTransactionalData", () => {
  it("executes a single atomic TRUNCATE call", async () => {
    const prisma = mockPrisma();

    await cleanTransactionalData(prisma as any);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it("truncates all 9 transactional tables", async () => {
    const prisma = mockPrisma();

    await cleanTransactionalData(prisma as any);

    const sqlArg = (prisma.$queryRawUnsafe as any).mock.calls[0][0] as string;

    expect(sqlArg).toEqual(expect.stringContaining("delivery_attempts"));
    expect(sqlArg).toEqual(expect.stringContaining("message_deliveries"));
    expect(sqlArg).toEqual(expect.stringContaining("messages"));
    expect(sqlArg).toEqual(expect.stringContaining("notification_targets"));
    expect(sqlArg).toEqual(expect.stringContaining("provider_connections"));
    expect(sqlArg).toEqual(expect.stringContaining("daily_usage"));
    expect(sqlArg).toEqual(expect.stringContaining("audit_logs"));
    expect(sqlArg).toEqual(expect.stringContaining("user_roles"));
    expect(sqlArg).toEqual(expect.stringContaining("users"));
  });

  it("excludes seed tables (providers, roles)", async () => {
    const prisma = mockPrisma();

    await cleanTransactionalData(prisma as any);

    const sqlArg = (prisma.$queryRawUnsafe as any).mock.calls[0][0] as string;

    // Extract table list between TRUNCATE TABLE and RESTART IDENTITY CASCADE
    const match = sqlArg.match(
      /TRUNCATE TABLE\s+([\s\S]+?)\s+RESTART IDENTITY CASCADE/,
    );
    expect(match).not.toBeNull();
    if (!match || match[1] === undefined) {
      throw new Error("unreachable: TRUNCATE TABLE pattern must capture table list");
    }

    const tableList = match[1];
    const tables = tableList
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    // Seed tables must NOT appear as standalone entries
    expect(tables).not.toContain("roles");
    expect(tables).not.toContain("providers");

    // Verify the full SQL also doesn't contain them as word-boundary matches
    expect(sqlArg).not.toMatch(/\broles\b/);
    expect(sqlArg).not.toMatch(/\bproviders\b/);
  });

  it("uses PostgreSQL TRUNCATE syntax with RESTART IDENTITY CASCADE", async () => {
    const prisma = mockPrisma();

    await cleanTransactionalData(prisma as any);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("RESTART IDENTITY CASCADE"),
    );
  });

  it("rejects execution outside test environment (primary guard)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "");

    const prisma = mockPrisma();

    await expect(cleanTransactionalData(prisma as any)).rejects.toThrow(
      "must only run in test environment",
    );

    vi.unstubAllEnvs();
  });

  it("rejects execution when DATABASE_URL lacks '_test' (secondary guard)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VITEST", "1");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://localhost:5432/notification_hub_db",
    );

    const prisma = mockPrisma();

    await expect(cleanTransactionalData(prisma as any)).rejects.toThrow(
      "requires a test database",
    );

    vi.unstubAllEnvs();
  });
});
