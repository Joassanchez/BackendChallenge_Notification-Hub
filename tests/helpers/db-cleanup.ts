import type { PrismaClient } from "../../src/generated/prisma/client.js";

/**
 * Deletes all transactional data in FK-safe order.
 * Preserves base/seed data: providers, roles.
 * Call in beforeEach() to ensure test isolation.
 */
export async function cleanTransactionalData(prisma: PrismaClient): Promise<void> {
  await prisma.deliveryAttempt.deleteMany();
  await prisma.messageDelivery.deleteMany();
  await prisma.message.deleteMany();
  await prisma.notificationTarget.deleteMany();
  await prisma.providerConnection.deleteMany();
  await prisma.dailyUsage.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
}
