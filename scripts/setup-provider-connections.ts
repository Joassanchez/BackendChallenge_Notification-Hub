import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ProviderCode, Prisma } from "../src/generated/prisma/client.js";

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });

  const prisma = new PrismaClient({ adapter });

  try {
    const telegram = await prisma.provider.findUnique({ where: { code: ProviderCode.telegram } });
    const discord = await prisma.provider.findUnique({ where: { code: ProviderCode.discord } });

    if (!telegram || !discord) {
      throw new Error("Providers telegram/discord are missing. Run seed first.");
    }

    // Idempotent: only create if the connection doesn't already exist.
    // This is safe to run on every startup alongside the seed.

    const existingTelegram = await prisma.providerConnection.findFirst({
      where: { providerId: telegram.id, name: "local_telegram_main" },
    });

    if (!existingTelegram) {
      await prisma.providerConnection.create({
        data: {
          providerId: telegram.id,
          name: "local_telegram_main",
          authType: "bot-token",
          secretRef: "TELEGRAM_BOT_TOKEN",
          config: Prisma.JsonNull,
          isActive: true,
        },
      });
      console.log("Created Telegram provider connection");
    }

    const existingDiscord = await prisma.providerConnection.findFirst({
      where: { providerId: discord.id, name: "local_discord_main" },
    });

    if (!existingDiscord) {
      await prisma.providerConnection.create({
        data: {
          providerId: discord.id,
          name: "local_discord_main",
          authType: "webhook",
          secretRef: null,
          config: {
            webhookUrl: process.env.DISCORD_WEBHOOK_URL ?? "",
          },
          isActive: true,
        },
      });
      console.log("Created Discord provider connection");
    }

    const existingDiscordBot = await prisma.providerConnection.findFirst({
      where: { providerId: discord.id, name: "local_discord_bot" },
    });

    if (!existingDiscordBot) {
      await prisma.providerConnection.create({
        data: {
          providerId: discord.id,
          name: "local_discord_bot",
          authType: "bot-token",
          secretRef: "DISCORD_BOT_TOKEN",
          config: Prisma.JsonNull,
          isActive: true,
        },
      });
      console.log("Created Discord bot-token provider connection");
    }

    const connections = await prisma.providerConnection.findMany({
      where: {
        providerId: {
          in: [telegram.id, discord.id],
        },
        isActive: true,
      },
      include: {
        provider: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const result = connections.map((connection) => {
      const config = connection.config as Record<string, unknown> | null;
      const webhookUrl = typeof config?.webhookUrl === "string" ? config.webhookUrl : "";

      return {
        id: connection.id,
        provider: connection.provider.code,
        name: connection.name,
        hasSecretRef: connection.secretRef !== null,
        hasWebhookUrl: webhookUrl.trim().length > 0,
      };
    });

    console.log(JSON.stringify({ providerConnections: result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
