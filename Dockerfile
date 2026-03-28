FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app

# Install ALL deps (including devDeps → prisma CLI needed for generate)
COPY package*.json ./
RUN npm ci

# Copy source and generate Prisma client with correct Linux binary
COPY . .
RUN npx prisma generate

# Remove devDependencies to keep image lean
RUN npm prune --production

EXPOSE 3000
CMD ["node", "src/index.js"]
