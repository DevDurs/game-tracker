FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server ./server
COPY public ./public
COPY admin ./admin

ENV PORT=9012
EXPOSE 9012

CMD ["node", "server/index.js"]
