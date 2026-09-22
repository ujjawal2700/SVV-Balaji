FROM node:20-alpine

WORKDIR /app

# build tools needed for native modules (e.g. bcrypt) on Alpine, which has
# no prebuilt musl binary and falls back to compiling from source
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma

RUN npm install
RUN npx prisma generate

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/main"]
