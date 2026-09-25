# SchoolSafe Server — Dockerfile multi-stage (Docker Compose / VPS)
# Build : npm run build (tsc)
# Start : node dist/src/index.js

# SQL renderer: no network credentials, HTTP server or application startup.
FROM node:22-alpine AS db-migrator
WORKDIR /work
COPY --chown=node:node scripts/render-additive-upgrade.mjs scripts/installation-plan.mjs scripts/migration-manifest.mjs ./scripts/
COPY --chown=node:node database/ ./database/
USER node
ENTRYPOINT ["node", "scripts/render-additive-upgrade.mjs"]

# ---- Stage 1 : Builder ----
FROM node:22-alpine AS builder
WORKDIR /app

# Dépendances (cache efficace) — --include=dev : le stage builder a besoin de
# TypeScript (tsc) même si NODE_ENV=production est injecté au build par le moteur de build.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
RUN npm ci --workspace server --include-workspace-root=false --include=dev

# Sources TypeScript
WORKDIR /app/server
COPY server/tsconfig.json ./
COPY server/src/ ./src/

# Build
RUN npm run build

# ---- Stage 2 : Production ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Dépendances prod uniquement
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
RUN npm ci --workspace server --include-workspace-root=false --omit=dev && npm cache clean --force

# Artifacts build
WORKDIR /app/server
COPY --from=builder /app/server/dist/ ./dist/

# Frontend statique
COPY app/ /app/app/
COPY shared/ /app/shared/

# Sources SQL conservées ; aucune migration au démarrage.
# Lire database/installation/README.md avant toute installation.
COPY database/ /app/database/

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8787/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/src/index.js"]
