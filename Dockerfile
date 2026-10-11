FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build:cpp

ENV HOST=0.0.0.0
EXPOSE 10000

CMD ["node", "server/index.js"]