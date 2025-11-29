FROM node:20 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

RUN npm run build

FROM node:20-slim 

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm install --only=production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public 
COPY --from=builder /app/node_modules/ /app/node_modules/ 
COPY --from=builder /app/next.config.ts ./

EXPOSE 3000

CMD ["npm", "start"]
