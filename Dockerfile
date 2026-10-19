# One image runs everything: the Express API also serves the built React app.
# syntax=docker/dockerfile:1

FROM node:24-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:24-alpine AS server
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/data/atlas.db
WORKDIR /app
COPY --from=server /app/server/node_modules ./server/node_modules
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY --from=web /app/web/dist ./web/dist
# The API reads the dataset to validate question ids.
COPY web/public/data/atlas.json ./web/public/data/atlas.json
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8787/api/health || exit 1
CMD ["node", "server/src/index.js"]
