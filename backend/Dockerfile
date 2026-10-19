FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
COPY ai-services/package.json ./ai-services/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY ai-services ./ai-services
COPY backend ./backend
RUN npm run build:backend

# Run migrations explicitly before rolling out the runtime container.
FROM build AS migrate
WORKDIR /app/backend
CMD ["npm", "run", "db:deploy"]

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
COPY ai-services/package.json ./ai-services/package.json
RUN npm ci --omit=dev --workspace @pickyourway/server --workspace @pickyourway/ai-services && npm cache clean --force
COPY --from=build /app/ai-services/dist ./ai-services/dist
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/resources ./backend/resources
USER node
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "dist/index.js"]
