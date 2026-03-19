# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for argon2 native module
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source
COPY tsconfig.json drizzle.config.ts ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies for argon2
RUN apk add --no-cache libstdc++

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built output
COPY --from=builder /app/dist ./dist

# Copy static assets
COPY src/public ./src/public

# Copy migration files
COPY src/db/migrations ./src/db/migrations
COPY drizzle.config.ts ./

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the web server
CMD ["node", "dist/server.js"]
