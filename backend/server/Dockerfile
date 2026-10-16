# ═══════════════════════════════════════════════
# NEUROVAULT API Gateway — Production Dockerfile
# Multi-stage build, non-root user, health check
# ═══════════════════════════════════════════════

# ── Stage 1: Dependencies ──
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --production --ignore-scripts && npm cache clean --force

# ── Stage 2: Production ──
FROM node:20-alpine AS runtime

# Security: non-root user
RUN addgroup -g 1001 -S neurovault && \
    adduser -S neurovault -u 1001 -G neurovault

WORKDIR /app

# Copy only production deps from stage 1
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=neurovault:neurovault . .

# Create required directories
RUN mkdir -p /app/uploads && chown -R neurovault:neurovault /app/uploads

# Remove test files and dev artifacts from production image
RUN rm -rf tests/ vitest.config.js .env.example *.test.js

# Switch to non-root
USER neurovault

# Environment defaults (overridden by docker-compose/k8s)
ENV NODE_ENV=production \
    PORT=5000

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["node", "index.js"]
