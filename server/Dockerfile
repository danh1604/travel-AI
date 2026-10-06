FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY ai-services/package.json ./ai-services/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY ai-services ./ai-services
COPY server ./server
RUN npm run build:server

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY ai-services/package.json ./ai-services/package.json
RUN npm ci --omit=dev --workspace @pickyourway/server --workspace @pickyourway/ai-services && npm cache clean --force
COPY --from=build /app/ai-services/dist ./ai-services/dist
COPY --from=build /app/server/dist ./server/dist
USER node
WORKDIR /app/server
EXPOSE 4000
CMD ["node", "dist/index.js"]
