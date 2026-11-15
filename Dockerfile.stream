# Stream worker image (webtorrent + ffmpeg). Deploy to a VPS / Railway / Fly.
# Set STREAM_SECRET (same as the API) and expose STREAM_PORT.
FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY stream.js ./
COPY stream-worker ./stream-worker
COPY src/config ./src/config
COPY src/utils ./src/utils
COPY src/nyaa ./src/nyaa
ENV NODE_ENV=production STREAM_PORT=4100 STREAM_CACHE_DIR=/data
# A fresh volume inherits this ownership; without it `USER node` can't write /data.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 4100
USER node
CMD ["node", "stream.js"]
