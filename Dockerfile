# Provia agent (Render Docker service). Linux x64 glibc, so Reclaim's TEE client library runs.
FROM node:24-bookworm-slim
ENV NODE_ENV=production RECEIPTS_DIR=/tmp/provia-receipts ZKTLS_MODE=tee
WORKDIR /app
# Reclaim's TEE client library does its own TLS and needs the system CA store.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY agent/package.json agent/package.json
COPY circuits/package.json circuits/package.json
COPY contracts/package.json contracts/package.json
RUN npm ci --workspace @provia/agent --include-workspace-root=false --ignore-scripts && npm cache clean --force
COPY agent/src agent/src
COPY circuits/artifacts circuits/artifacts
COPY evidence/deployment-base-sepolia.json evidence/deployment-base-sepolia.json
RUN chown -R node:node /app
USER node
EXPOSE 10000
CMD ["node", "agent/src/server.ts"]
