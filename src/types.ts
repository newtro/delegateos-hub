import type { AuthEntity } from "./middleware/auth.js";

// Hono environment type used across the app
export type AppEnv = {
  Variables: {
    auth: AuthEntity;
  };
};
