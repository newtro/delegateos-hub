// Test environment setup
// Set test environment before any imports
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://delegateos:delegateos_dev@localhost:5432/delegateos_test";
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6379";
process.env.LOG_LEVEL = "silent";
