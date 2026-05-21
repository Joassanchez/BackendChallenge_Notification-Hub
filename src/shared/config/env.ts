import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }

  return parsed;
}

export const env = {
  DATABASE_URL: requireEnv("DATABASE_URL"),
  JWT_SECRET: requireEnv("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN?.trim() || "1d",
  PORT: optionalNumber("PORT", 3000),
} as const;
