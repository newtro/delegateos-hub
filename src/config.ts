import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://delegateos:delegateos_dev@localhost:5432/delegateos"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  HUB_PRIVATE_KEY: z.string().optional(),
  HUB_PUBLIC_KEY: z.string().optional(),
  PLATFORM_FEE_PERCENTAGE: z.coerce.number().min(0).max(100).default(5),
  DEFAULT_POLLING_INTERVAL_SECONDS: z.coerce.number().positive().default(60),
  DEFAULT_SYNC_INTERVAL_HOURS: z.coerce.number().positive().default(24),
  PORT: z.coerce.number().positive().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  HUB_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.format();
    console.error("Invalid environment configuration:", formatted);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
