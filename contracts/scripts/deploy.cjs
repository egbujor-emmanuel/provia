// Deploy ProviaEscrow to Base Sepolia and record the deployment in evidence/.
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const ZKVERIFY_PROXY_BASE_SEPOLIA = "0x0807C544D38aE7729f8798388d89Be6502A1e8A8"; // zkverify-docs 08-contract-addresses.md
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Circle testnet USDC
const VK_HASH = "0x23abe0175caa02a03514d25fb4812e6ef5f2cee9a9f03800cafae54735446e14"; // evidence/vk-hash.txt
const AGGREGATION_DOMAIN_BASE_SEPOLIA = 2; // Kurier testnet aggregation domain for chainId 84532 (evidence/g2-leaf-parity.json)

async function main() {
  if (network.name !== "baseSepolia") throw new Error(`refusing to deploy to ${network.name}`);
  const [deployer] = await ethers.getSigners();
  const Escrow = await ethers.getContractFactory("ProviaEscrow");
  // The deployer key is also the agent's key: it is the only address allowed to release.
  // Price from the real base fee: the default tip reserves far more ETH than Base Sepolia charges.
  const block = await ethers.provider.getBlock("latest");
  const tip = ethers.parseUnits("0.002", "gwei");
  const fees = { maxFeePerGas: block.baseFeePerGas * 3n + tip, maxPriorityFeePerGas: tip };
  const escrow = await Escrow.deploy(ZKVERIFY_PROXY_BASE_SEPOLIA, VK_HASH, USDC_BASE_SEPOLIA, deployer.address, AGGREGATION_DOMAIN_BASE_SEPOLIA, fees);
  const receipt = await escrow.deploymentTransaction().wait(2);
  const record = {
    network: "base-sepolia",
    chainId: 84532,
    contract: "ProviaEscrow",
    address: await escrow.getAddress(),
    deployTx: receipt.hash,
    block: receipt.blockNumber,
    deployer: deployer.address,
    constructor: { zkVerify: ZKVERIFY_PROXY_BASE_SEPOLIA, vkHash: VK_HASH, token: USDC_BASE_SEPOLIA, agent: deployer.address, aggregationDomain: AGGREGATION_DOMAIN_BASE_SEPOLIA },
    deployedAt: new Date().toISOString(),
  };
  const out = path.join(__dirname, "..", "..", "evidence", "deployment-base-sepolia.json");
  fs.writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
  process.stdout.write(JSON.stringify(record, null, 2) + "\n");
}

main().catch((e) => { process.stderr.write(String(e?.message || e) + "\n"); process.exitCode = 1; });
