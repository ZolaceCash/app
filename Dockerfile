# The shop's site as one container (deploy/README.md). Built in three steps so the image that runs
# holds the traced server and nothing else: no source, no dev tools, no package manager cache.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# BUILD_STANDALONE makes `next build` write .next/standalone (next.config.ts).
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# The database is one SQLite file under /app/data (lib/db). It is a volume, so it outlives the
# container; the folder is made here so the volume starts out owned by the user the app runs as.
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME /app/data
EXPOSE 3000
CMD ["node", "server.js"]
