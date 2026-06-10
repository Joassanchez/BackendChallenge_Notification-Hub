import crypto from "node:crypto";
import { badRequest } from "../../../shared/http/errors.js";
import type { ConnectCodeEntry, ConnectCodeResult } from "./connect-code.types.js";

export class ConnectCodeService {
  private readonly store = new Map<string, ConnectCodeEntry>();
  private readonly botUsername: string;
  private readonly clock: () => number;

  constructor(botUsername?: string, clock?: () => number) {
    this.botUsername = botUsername ?? "";
    this.clock = clock ?? Date.now;
  }

  generate(userId: string, provider: string): ConnectCodeResult {
    // Invalidate prior unused codes for same userId+provider
    for (const entry of this.store.values()) {
      if (entry.userId === userId && entry.provider === provider && !entry.consumed) {
        entry.consumed = true;
      }
    }

    const code = crypto.randomBytes(3).toString("hex");
    const expiresAt = this.clock() + 300_000;
    const connectUrl = this.buildConnectUrl(code, provider);

    this.store.set(code, {
      userId,
      provider,
      code,
      expiresAt,
      consumed: false,
    });

    return {
      code,
      expiresAt: new Date(expiresAt).toISOString(),
      connectUrl,
    };
  }

  validate(code: string): { userId: string; provider: string } {
    const entry = this.store.get(code);

    if (entry === undefined) {
      throw badRequest("invalid code");
    }

    if (entry.consumed) {
      throw badRequest("code already used");
    }

    if (this.clock() > entry.expiresAt) {
      throw badRequest("code expired");
    }

    entry.consumed = true;

    return { userId: entry.userId, provider: entry.provider };
  }

  private buildConnectUrl(code: string, provider: string): string {
    if (provider === "discord") {
      return `/connect ${code}`;
    }
    // Telegram (and default fallback)
    return `https://t.me/${this.botUsername}?start=${code}`;
  }
}
