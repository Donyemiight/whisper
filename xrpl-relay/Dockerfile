FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npx --yes tsx --version
ENV NODE_ENV=production

EXPOSE 8788

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q -O- http://localhost:8788/health || exit 1

CMD ["npx", "tsx", "src/index.ts"]
