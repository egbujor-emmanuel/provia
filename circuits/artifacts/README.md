# Frozen release-policy artifacts

The deployed ProviaEscrow pins vkHash 0x23abe0175caa02a03514d25fb4812e6ef5f2cee9a9f03800cafae54735446e14,
computed from verification_key.json by the zkVerify node (agent/scripts/vk-hash.mjs).
Do not regenerate these; a new setup produces a new vkHash and breaks every deployed escrow.
Trusted setup: local development ceremony (see scripts/build.sh). Production requires a multi-party ceremony.
