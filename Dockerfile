FROM node:20-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
  && npm cache clean --force

COPY . .

EXPOSE 8090

CMD ["node", "index.js"]
