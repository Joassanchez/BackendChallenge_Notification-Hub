import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const scriptPath = resolve(import.meta.dirname, "../../scripts/setup-provider-connections.ts");
const scriptContent = readFileSync(scriptPath, "utf-8");

describe("setup-provider-connections — Discord bot-token connection", () => {
  it("contains local_discord_bot connection definition", () => {
    expect(scriptContent).toContain('"local_discord_bot"');
  });

  it("uses bot-token authType for the new Discord connection", () => {
    expect(scriptContent).toContain('authType: "bot-token"');
  });

  it("references DISCORD_BOT_TOKEN as secretRef", () => {
    expect(scriptContent).toContain('"DISCORD_BOT_TOKEN"');
  });

  it("uses idempotent findFirst pattern for local_discord_bot", () => {
    // The script must have findFirst before create for the bot-token connection
    expect(scriptContent).toContain("local_discord_bot");
    expect(scriptContent).toContain("existingDiscordBot");
    // Verify findFirst is called before create in the bot-token block
    const botBlockStart = scriptContent.indexOf("existingDiscordBot");
    const botBlock = scriptContent.slice(botBlockStart, botBlockStart + 400);
    const findFirstIdx = botBlock.indexOf("findFirst");
    const createIdx = botBlock.indexOf('create({');
    expect(findFirstIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    expect(findFirstIdx).toBeLessThan(createIdx);
  });
});
