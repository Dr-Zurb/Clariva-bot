# Clariva backend - production image
# Build: docker build -t clariva-backend .
# Run: docker run -p 3000:3000 --env-file .env clariva-backend
# See docs/setup/deployment-runbook.md for full deploy steps.

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
EXPOSE 3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

USER node
CMD ["node", "dist/index.js"]
