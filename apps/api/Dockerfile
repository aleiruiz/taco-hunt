FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/src packages/contracts/src
RUN pnpm install --filter @taco-hunt/api...
COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN pnpm --filter @taco-hunt/api build
RUN pnpm --filter @taco-hunt/api --prod deploy --legacy /app/deploy

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/deploy ./
EXPOSE 3001
CMD ["node", "dist/main.js"]
