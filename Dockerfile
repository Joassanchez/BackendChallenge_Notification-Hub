FROM node:24-bookworm-slim

# curl is NOT included in node:24-bookworm-slim (contrary to design assumption).
# Install it for the Docker healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests first (layer caching)
COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install ALL dependencies (devDependencies included — tsx is required at runtime)
RUN npm ci

# Generate Prisma client (baked into image at build time)
# prisma.config.ts uses env("DATABASE_URL") — provide a dummy value for the generate step.
# Runtime DATABASE_URL is set by docker-compose.yml environment and takes precedence.
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy?schema=public" npx prisma generate

# Copy application source
COPY src ./src/
COPY scripts ./scripts/
COPY tsconfig.json vitest.config.ts ./
COPY docker-entrypoint.sh ./

# Non-root user
USER node

EXPOSE 3000

ENV NODE_ENV=production

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npx", "tsx", "src/main.ts"]
