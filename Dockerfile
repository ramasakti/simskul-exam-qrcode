FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

RUN bun knex migrate:latest

ENV PORT=3100
EXPOSE 3100

CMD ["bun", "index.js"]