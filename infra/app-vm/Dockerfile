FROM oven/bun:1.3.14 AS bun
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS dependencies
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
WORKDIR /app
COPY package.json bun.lock ./
COPY svelte/package.json svelte/bun.lock ./svelte/
COPY scripts/link-agent-skills.ts ./scripts/
COPY .agents/skills ./.agents/skills
RUN mkdir -p svelte/static
RUN --mount=type=cache,target=/root/.bun/install/cache cd svelte && bun install --frozen-lockfile && cd .. && bun install --frozen-lockfile

FROM dependencies AS build
COPY . .
ARG ESSENTIA_ANALYSIS_ENABLED=true
ARG ESSENTIA_API_BASE_URL
ENV ESSENTIA_ANALYSIS_ENABLED=$ESSENTIA_ANALYSIS_ENABLED ESSENTIA_API_BASE_URL=$ESSENTIA_API_BASE_URL
RUN bun run build

FROM oven/bun:1.3.14-slim AS runtime
ARG APP_REVISION=development
ENV NODE_ENV=production HOST=127.0.0.1 PORT=18074 APP_REVISION=$APP_REVISION
WORKDIR /app
COPY --from=build --chown=bun:bun /app/svelte/build ./svelte/build
COPY --from=build --chown=bun:bun /app/api ./api
COPY --from=build --chown=bun:bun /app/media-worker/auth.ts ./media-worker/auth.ts
COPY --from=build --chown=bun:bun /app/runtime ./runtime
# Runtime imports use Bun/Node built-ins; managed health checks guard startup.
USER bun
CMD ["bun","runtime/server.ts"]
