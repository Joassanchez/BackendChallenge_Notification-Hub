import "dotenv/config";
import { PrismaClient, ProviderCode, RoleCode } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const userRole = await prisma.role.upsert({
    where: { code: RoleCode.USER },
    update: {},
    create: {
      code: RoleCode.USER,
      name: "Default user",
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { code: RoleCode.ADMIN },
    update: {},
    create: {
      code: RoleCode.ADMIN,
      name: "Administrator",
    },
  });

  const passwordHash = await bcrypt.hash("Admin123!", 10);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@notificationhub.local",
      passwordHash,
      roles: {
        create: {
          roleId: adminRole.id,
        },
      },
    },
  });

  await prisma.provider.upsert({
    where: { code: ProviderCode.telegram },
    update: {},
    create: {
      code: ProviderCode.telegram,
      name: "Telegram",
    },
  });

  await prisma.provider.upsert({
    where: { code: ProviderCode.discord },
    update: {},
    create: {
      code: ProviderCode.discord,
      name: "Discord",
    },
  });

  console.log("Seed completed");
  console.log({
    adminUsername: admin.username,
    adminPassword: "Admin123!",
    roles: [userRole.code, adminRole.code],
    providers: [ProviderCode.telegram, ProviderCode.discord],
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
