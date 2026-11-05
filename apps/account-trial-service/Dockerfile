# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run prisma:generate
RUN npm run build

FROM node:24-bookworm-slim AS runtime
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy generated Prisma Client + query engine from build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
