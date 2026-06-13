FROM node:20-alpine
WORKDIR /app

COPY packages/shared-utils /app/packages/shared-utils
RUN cd /app/packages/shared-utils && npm install --omit=dev

COPY microservice11/package.json /app/service/package.json
WORKDIR /app/service
RUN npm install --omit=dev

COPY microservice11/src /app/service/src

ENV NODE_ENV=production
EXPOSE 5011
CMD ["node", "src/server.js"]
