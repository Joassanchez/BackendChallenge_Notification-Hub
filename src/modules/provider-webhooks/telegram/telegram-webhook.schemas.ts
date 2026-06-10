import { z } from "zod";

export const telegramUpdateSchema = z.object({
  message: z.object({
    message_id: z.number(),
    text: z.string().optional(),
    chat: z.object({
      id: z.number(),
    }),
  }).optional(),
});
