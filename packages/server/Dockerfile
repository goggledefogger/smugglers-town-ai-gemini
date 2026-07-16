# Build from the repo root (workspace deps live outside this package):
#   docker build -f packages/server/Dockerfile -t smugglers-town-server .
FROM node:20-slim

RUN corepack enable

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared-utils ./packages/shared-utils
COPY packages/shared-schemas ./packages/shared-schemas
COPY packages/server ./packages/server

RUN pnpm install --frozen-lockfile --filter smugglers-town-server... \
    && pnpm --filter smugglers-town-server build

ENV PORT=2567
EXPOSE 2567
CMD ["node", "packages/server/lib/index.js"]
