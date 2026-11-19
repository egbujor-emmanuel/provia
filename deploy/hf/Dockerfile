# Provia agent on a Hugging Face Docker Space (Linux x64, glibc: Reclaim's TEE client library runs here).
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=7860 RECEIPTS_DIR=/tmp/provia-receipts ZKTLS_MODE=tee
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node agent/package.json agent/package.json
COPY --chown=node:node circuits/package.json circuits/package.json
COPY --chown=node:node contracts/package.json contracts/package.json
RUN npm ci --workspace @provia/agent --include-workspace-root=false --ignore-scripts --omit=dev && npm cache clean --force && chown -R node:node /app
COPY --chown=node:node agent/src agent/src
COPY --chown=node:node circuits/artifacts circuits/artifacts
COPY --chown=node:node evidence/deployment-base-sepolia.json evidence/deployment-base-sepolia.json
USER node
EXPOSE 7860
CMD ["node", "agent/src/server.ts"]
