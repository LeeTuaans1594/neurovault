# ═══════════════════════════════════════════════
# NEUROVAULT Frontend — Production Dockerfile
# Multi-stage: build with Node, serve with Nginx
# ═══════════════════════════════════════════════

# ── Stage 1: Build ──
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Serve ──
FROM nginx:1.27-alpine AS runtime

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Security headers in nginx
RUN echo 'server_tokens off;' > /etc/nginx/conf.d/security.conf

# Non-root user (nginx alpine runs as nginx user by default)
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
