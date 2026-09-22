# Halo Aid backend - production image
# Build: docker build -t clariva-backend .
# Run: docker run -p 3000:3000 --env-file .env clariva-backend
# See docs/setup/deployment-runbook.md for full deploy steps.
#
# bookworm, not Alpine: the `canvas` addon ships a glibc prebuild and
# needs Cairo at runtime. Alpine has neither, so `npm ci` fails there.

FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
EXPOSE 3000

COPY package.json package-lock.json ./
# Compilers stay only for this install. The glibc prebuild is preferred;
# node-gyp is the fallback if that download misses. Cairo stays for runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
 && npm ci --omit=dev \
 && apt-get purge -y python3 make g++ pkg-config \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist

USER node
CMD ["node", "dist/index.js"]
