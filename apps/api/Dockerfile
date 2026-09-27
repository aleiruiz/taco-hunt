FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @taco-hunt/api...
COPY apps/api apps/api
RUN pnpm --filter @taco-hunt/api exec tsc

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
