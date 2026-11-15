# API + nyaa stream worker in one container (webtorrent + ffmpeg). Render / VPS / Fly.
# Set STREAM_SECRET and STREAM_ORIGIN (this service's own public URL).
# Worker only (split deploy): override the command with `node stream.js`.
FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production STREAM_EMBED=true STREAM_CACHE_DIR=/data
# A fresh volume inherits this ownership; without it `USER node` can't write /data.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
CMD ["node", "index.js"]
