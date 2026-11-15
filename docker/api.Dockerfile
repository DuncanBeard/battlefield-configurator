FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY server ./server
COPY lib ./lib
RUN rm -f server/*.test.ts server/generate-auth-schema.ts && mkdir -p /data && chown bun:bun /data
USER bun
ENV NODE_ENV=production DATABASE_PATH=/data/configurator.sqlite PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD bun -e "const r = await fetch('http://127.0.0.1:3000/api/health/ready'); process.exit(r.ok ? 0 : 1)"
CMD ["bun", "run", "server/index.ts"]
