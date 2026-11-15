# --- Build stage ---
FROM oven/bun:1-alpine AS build
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source needed for the web build
COPY tsconfig.json svelte.config.js vite.config.ts index.html ./
COPY lib ./lib
COPY src ./src
COPY base ./base
COPY devices ./devices

ARG VITE_ENABLE_ACCOUNTS=false
ENV VITE_ENABLE_ACCOUNTS=$VITE_ENABLE_ACCOUNTS
RUN bun run build

# --- Runtime stage ---
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/api-disabled.conf /etc/nginx/bf6-api.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
