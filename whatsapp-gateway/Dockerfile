# ─── AD Pulse WhatsApp Gateway ────────────────────────────────────────────────
# Multi-stage build: собираем TypeScript, в рантайм кладём только dist + prod deps.

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist

# Сессии WhatsApp, кэш чатов и медиа. Обязательно монтировать volume:
# без него после каждого рестарта клиенты сканируют QR заново.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV DATA_DIR=/app/data
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
