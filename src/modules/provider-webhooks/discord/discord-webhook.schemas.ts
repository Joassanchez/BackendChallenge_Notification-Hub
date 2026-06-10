import { z } from "zod";

export const discordInteractionSchema = z.object({
  type: z.number(),
  data: z.object({
    name: z.string().optional(),
    options: z.array(z.object({
      name: z.string(),
      value: z.string(),
    })).optional(),
  }).optional(),
  channel_id: z.string().optional(),
  token: z.string().optional(),
});
