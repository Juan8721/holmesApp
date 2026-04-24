# ── Stage 1: dependency install ───────────────────────────────────────────
FROM node:18-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ── Stage 2: production image ─────────────────────────────────────────────
FROM node:18-alpine

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY app.js .
COPY package.json .

EXPOSE 3000

# Run as non-root user for security
USER node

CMD ["node", "app.js"]
