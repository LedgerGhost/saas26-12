FROM node:20-alpine
WORKDIR /app

COPY services/mock-payments/package.json /app/service/package.json
WORKDIR /app/service
RUN npm install --omit=dev

COPY services/mock-payments/src /app/service/src

ENV NODE_ENV=production
EXPOSE 5008
CMD ["node", "src/server.js"]
