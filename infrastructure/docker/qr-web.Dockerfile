# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
RUN npm i -g pnpm@10.34.9
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY packages/api-client packages/api-client
COPY apps/qr-web apps/qr-web
RUN pnpm install --frozen-lockfile --filter "@servebell/qr-web..."
ARG NEXT_PUBLIC_APP_STORE_URL=""
ARG NEXT_PUBLIC_PLAY_STORE_URL=""
ARG NEXT_PUBLIC_APP_SCHEME="servebell"
RUN pnpm --filter @servebell/shared build && pnpm --filter @servebell/api-client build && pnpm --filter @servebell/qr-web build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/qr-web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/qr-web/.next/static ./apps/qr-web/.next/static
COPY --from=build --chown=node:node /repo/apps/qr-web/public ./apps/qr-web/public
USER node
EXPOSE 3000
CMD ["node", "apps/qr-web/server.js"]
