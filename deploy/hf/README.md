---
title: Provia Agent
colorFrom: gray
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: Escrow agent that releases crypto only on proven payment
---

# Provia agent

The Provia escrow agent's API and Agent Games endpoint. Source, docs and proofs: see the Provia GitHub repository.

- `POST /agent`: Agent Games endpoint (HMAC-signed, preflight and fail-closed REJECT)
- `GET /api/config`, `GET /api/receipts`, `GET /api/receipts/:id`
- `POST /api/demo/:scenario`: live demo trades on Base Sepolia (rate limited)
