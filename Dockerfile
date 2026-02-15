FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace root
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy all packages
COPY packages/policy ./packages/policy
COPY packages/schema ./packages/schema
COPY packages/autopay ./packages/autopay

# Copy apps
COPY apps/gateway ./apps/gateway
COPY apps/upstream ./apps/upstream

# Install deps
RUN pnpm install --frozen-lockfile

# Build packages then apps
RUN pnpm -C packages/policy build
RUN pnpm -C packages/schema build
RUN pnpm -C packages/autopay build
RUN pnpm -C apps/upstream build
RUN pnpm -C apps/gateway build

# Copy start script
COPY railway-start.sh ./
RUN chmod +x railway-start.sh

EXPOSE ${PORT:-3000}

CMD ["./railway-start.sh"]
