# Stage 1: Build frontend (dashboard)
FROM node:20-alpine AS frontend-builder
WORKDIR /dashboard
COPY dashboard/package*.json ./
RUN npm ci && npm cache clean --force
COPY dashboard/ ./
RUN npm run build

# Stage 2: Build backend API
FROM node:20-alpine
WORKDIR /app

# Instala só dependências de produção da API
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copia código da API
COPY src/ ./src/

# Copia frontend buildado para o diretório public da API
COPY --from=frontend-builder /dashboard/dist/ ./src/api/public/

# Porta da API GTK
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/api/server.js"]
