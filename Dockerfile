FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
ENV PORT=3100
EXPOSE 3100

CMD ["sh", "entrypoint.sh"]