# ============================
# Stage 1: Dependencies
# ============================
FROM node:20-alpine AS deps

WORKDIR /app

# Install build tools only once (for native dependencies)
RUN apk add --no-cache python3 make g++

# Copy only dependency manifests (cache-friendly)
COPY package.json yarn.lock ./

# Install all dependencies (include devDeps for build)
RUN yarn install --frozen-lockfile

# ============================
# Stage 2: Builder
# ============================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy node_modules from deps (avoids reinstall)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/yarn.lock ./yarn.lock


# Copy source and TypeScript configs
COPY tsconfig*.json ./
COPY src ./src

# Copy proto files
COPY proto ./proto

# Build the project
RUN yarn build

# ============================
# Stage 3: Pruner (optional but powerful)
# ============================
FROM node:20-alpine AS pruner

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install only production dependencies
RUN yarn install --production --frozen-lockfile

# ============================
# Stage 4: Runner
# ============================
FROM node:20-alpine AS runner

WORKDIR /app

# Runtime utilities
RUN apk add --no-cache tini curl

# Copy production node_modules
COPY --from=pruner /app/node_modules ./node_modules

# Copy built app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/yarn.lock ./yarn.lock

# Copy proto files
COPY --from=builder /app/proto ./proto

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
  && mkdir -p /app/logs && chown -R appuser:appgroup /app

USER appuser

# Document exposed port
EXPOSE 50052

CMD ["yarn", "run", "start:prod"]
