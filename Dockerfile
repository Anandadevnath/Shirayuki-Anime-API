# API container for Render (render.yaml) or any Docker host.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
USER node
CMD ["node", "index.js"]
