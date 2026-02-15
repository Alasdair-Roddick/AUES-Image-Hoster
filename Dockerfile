FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY index.ts tsconfig.json ./

EXPOSE 6654
CMD ["bun", "run", "index.ts"]
