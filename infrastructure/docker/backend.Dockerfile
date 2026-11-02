# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
RUN npm i -g pnpm@10.34.9 && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY packages/api-client packages/api-client
COPY backend backend
RUN pnpm install --frozen-lockfile --filter "@servebell/backend..."
RUN pnpm --filter @servebell/shared build && pnpm --filter @servebell/backend build
# Self-contained production bundle (workspace deps copied in, dev deps dropped).
RUN pnpm deploy --legacy --filter @servebell/backend --prod /out \
 && cp -r backend/dist /out/dist \
 && cp -r backend/prisma backend/prisma.config.ts /out/

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
# /app/storage holds uploaded images when R2 is not configured (mounted as a volume).
RUN mkdir -p /app/storage && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
