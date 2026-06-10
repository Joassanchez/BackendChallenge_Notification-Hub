import { verify, createPublicKey } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { AppError } from "../../../shared/http/errors.js";
import type { ConnectCodeService } from "../connect-code/connect-code.service.js";
import type { NotificationTargetService } from "../../notifications/notification-targets/notification-target.service.js";
import { discordInteractionSchema } from "./discord-webhook.schemas.js";

// Ed25519 SPKI DER prefix for Node crypto (OID 1.3.101.112)
const ED25519_SPKI_PREFIX = "302a300506032b6570032100";

export class DiscordWebhookHandler {
  private readonly publicKeyObj: KeyObject;

  constructor(
    private readonly connectCodeService: ConnectCodeService,
    private readonly notificationTargetService: NotificationTargetService,
    private readonly publicKey: string,
  ) {
    const prefixBuffer = Buffer.from(ED25519_SPKI_PREFIX, "hex");
    const rawKeyBuffer = Buffer.from(this.publicKey, "hex");
    const spkiKey = Buffer.concat([prefixBuffer, rawKeyBuffer]);

    this.publicKeyObj = createPublicKey({
      key: spkiKey,
      format: "der",
      type: "spki",
    });
  }

  verifySignature(rawBody: Buffer, signature: string, timestamp: string): boolean {
    try {
      const data = Buffer.from(timestamp + rawBody.toString("utf-8"));
      const sigBuffer = Buffer.from(signature, "hex");

      return verify(
        null,
        data,
        this.publicKeyObj,
        sigBuffer,
      );
    } catch {
      return false;
    }
  }

  async handle(rawBody: Buffer, headers: { signature: string | undefined; timestamp: string | undefined }): Promise<{ status: number; body: unknown }> {
    if (headers.signature === undefined || headers.timestamp === undefined) {
      return { status: 401, body: { error: "Missing signature headers" } };
    }

    if (!this.verifySignature(rawBody, headers.signature, headers.timestamp)) {
      return { status: 401, body: { error: "Invalid signature" } };
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(rawBody.toString("utf-8"));
    } catch {
      return { status: 400, body: { error: "Invalid JSON body" } };
    }

    const validated = discordInteractionSchema.safeParse(parsed);

    if (!validated.success) {
      return { status: 400, body: { error: "Invalid interaction" } };
    }

    const interaction = validated.data;

    // PING (type 1) — respond with PONG
    if (interaction.type === 1) {
      return { status: 200, body: { type: 1 } };
    }

    // APPLICATION_COMMAND (type 2)
    if (interaction.type === 2) {
      const command = interaction.data?.name;

      if (command !== "connect") {
        return { status: 400, body: { error: "Unknown command" } };
      }

      const codeOption = interaction.data?.options?.find((opt) => opt.name === "code");

      if (codeOption === undefined) {
        return { status: 400, body: { error: "Missing code option" } };
      }

      const code = codeOption.value;
      const channelId = interaction.channel_id;

      if (channelId === undefined) {
        return { status: 400, body: { error: "Missing channel_id" } };
      }

      try {
        const { userId } = this.connectCodeService.validate(code);

        await this.notificationTargetService.autoCreate({
          userId,
          providerCode: "discord",
          externalTargetId: channelId,
          targetType: "channel",
        });

        return {
          status: 200,
          body: {
            type: 4,
            data: {
              content: "✅ Connected! You'll receive notifications in this channel.",
              flags: 64,
            },
          },
        };
      } catch (error) {
        if (error instanceof AppError) {
          return {
            status: 200,
            body: {
              type: 4,
              data: {
                content: `Error: ${error.message}`,
                flags: 64,
              },
            },
          };
        }

        throw error;
      }
    }

    return { status: 400, body: { error: "Unsupported interaction type" } };
  }
}
