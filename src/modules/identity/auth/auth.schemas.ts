import { z } from "zod";

export const registerBodySchema = z
  .object({
    username: z.string().optional(),
    email: z.string().optional(),
    password: z.string().optional(),
  })
  .strict()
  .refine((d) => (d.username?.trim().length ?? 0) > 0, {
    message: "username is required",
  })
  .refine(
    (d) => d.email === undefined || d.email.trim().length === 0 || d.email.includes("@"),
    { message: "email must be valid" },
  )
  .refine((d) => (d.password?.length ?? 0) > 0, {
    message: "password is required",
  });

export const loginBodySchema = z
  .object({
    username: z.string().optional(),
    email: z.string().optional(),
    identifier: z.string().optional(),
    password: z.string().optional(),
  })
  .strict()
  .refine(
    (d) => !!(d.username?.trim() || d.email?.trim() || d.identifier?.trim()),
    { message: "username/email is required" },
  )
  .refine((d) => (d.password?.length ?? 0) > 0, {
    message: "password is required",
  });
