import { z } from "zod";

export const connectCodeBodySchema = z.object({
  provider: z.enum(["telegram", "discord"]),
});

export type ConnectCodeBody = z.infer<typeof connectCodeBodySchema>;
