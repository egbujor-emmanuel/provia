const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const VK_HASH = ethers.keccak256(ethers.toUtf8Bytes("release_policy test vk"));
const USDC = (n) => BigInt(n) * 1_000_000n;
const ATT = { domainId: 0, aggregationId: 7, merklePath: [], leafCount: 1, index: 0 };

/** Independent leaf computation mirroring zkverifyjs (32-byte LE per signal) and the groth16 pallet. */
function leafJs(vkHash, signals) {
  const le = (v) => {
    const be = ethers.zeroPadValue(ethers.toBeHex(v), 32);
    return "0x" + Buffer.from(ethers.getBytes(be)).reverse().toString("hex");
  };
  const pubsHash = ethers.keccak256(ethers.concat(signals.map(le)));
  const provingSystemId = ethers.keccak256(ethers.toUtf8Bytes("groth16"));
  const versionHash = ethers.sha256("0x");
  return ethers.keccak256(ethers.concat([provingSystemId, vkHash, versionHash, pubsHash]));
}

describe("ProviaEscrow", () => {
  async function deploy() {
    const [seller, buyer, stranger, agent] = await ethers.getSigners();
    const verifier = await (await ethers.getContractFactory("AttestingVerifier")).deploy();
    const usdc = await (await ethers.getContractFactory("TestUSDC")).deploy();
    const deployed = await (await ethers.getContractFactory("ProviaEscrow")).deploy(
      await verifier.getAddress(), VK_HASH, await usdc.getAddress(), agent.address, ATT.domainId);
    // Release calls below come from the agent unless a test connects another signer.
    const escrow = deployed.connect(agent);
    await usdc.mint(seller.address, USDC(1000));
    await usdc.connect(seller).approve(await escrow.getAddress(), USDC(1000));
    const deadline = BigInt(await time.latest()) + 3600n;
    return { seller, buyer, stranger, agent, verifier, usdc, escrow, deadline };
  }

  async function lockedTrade(tradeId = 1001n) {
    const ctx = await deploy();
    await ctx.escrow.connect(ctx.seller).lock(tradeId, ctx.buyer.address, USDC(50), 5_000_000n, ctx.deadline);
    const proof = { nullifier: 123456789n, claimCommit: 987654321n };
    const signals = [proof.nullifier, tradeId, BigInt(ctx.buyer.address), 5_000_000n, ctx.deadline, proof.claimCommit];
    return { ...ctx, tradeId, proof, signals };
  }

  it("contract leaf equals the independently computed zkVerify leaf", async () => {
    const { escrow, tradeId, buyer, deadline, proof, signals } = await lockedTrade();
    const onChain = await escrow.statementLeaf(tradeId, BigInt(buyer.address), 5_000_000n, deadline, proof.nullifier, proof.claimCommit);
    expect(onChain).to.equal(leafJs(VK_HASH, signals));
  });

  it("lock pulls the seller's tokens and records the trade", async () => {
    const { escrow, usdc, tradeId } = await lockedTrade();
    expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(USDC(50));
    expect((await escrow.trades(tradeId)).state).to.equal(1n);
  });

  it("releases to the recipient when zkVerify attests the rebuilt leaf", async () => {
    const { escrow, verifier, usdc, buyer, tradeId, proof, signals } = await lockedTrade();
    await verifier.attest(leafJs(VK_HASH, signals));
    await expect(escrow.release(tradeId, proof.nullifier, proof.claimCommit, ATT))
      .to.emit(escrow, "Released");
    expect(await usdc.balanceOf(buyer.address)).to.equal(USDC(50));
    expect(await escrow.nullifierUsed(proof.nullifier)).to.equal(true);
  });

  it("refuses a release that zkVerify has not attested (forged claimCommit)", async () => {
    const { escrow, verifier, tradeId, proof, signals } = await lockedTrade();
    await verifier.attest(leafJs(VK_HASH, signals));
    await expect(escrow.release(tradeId, proof.nullifier, proof.claimCommit + 1n, ATT))
      .to.be.revertedWithCustomError(escrow, "ProofNotAttested");
  });

  it("a proof attested for a cheaper price cannot release this trade", async () => {
    const { escrow, verifier, tradeId, buyer, deadline, proof } = await lockedTrade();
    const cheaper = [proof.nullifier, tradeId, BigInt(buyer.address), 1_000_000n, deadline, proof.claimCommit];
    await verifier.attest(leafJs(VK_HASH, cheaper));
    await expect(escrow.release(tradeId, proof.nullifier, proof.claimCommit, ATT))
      .to.be.revertedWithCustomError(escrow, "ProofNotAttested");
  });

  it("REF_REUSED: one payment reference cannot release two trades", async () => {
    const { escrow, verifier, seller, buyer, deadline, tradeId, proof, signals } = await lockedTrade();
    await verifier.attest(leafJs(VK_HASH, signals));
    await escrow.release(tradeId, proof.nullifier, proof.claimCommit, ATT);
    const second = 1002n;
    await escrow.connect(seller).lock(second, buyer.address, USDC(50), 5_000_000n, deadline);
    await verifier.attest(leafJs(VK_HASH, [proof.nullifier, second, BigInt(buyer.address), 5_000_000n, deadline, proof.claimCommit]));
    await expect(escrow.release(second, proof.nullifier, proof.claimCommit, ATT))
      .to.be.revertedWithCustomError(escrow, "NullifierReused");
  });

  it("a released trade cannot be released or refunded again", async () => {
    const { escrow, verifier, seller, tradeId, proof, signals } = await lockedTrade();
    await verifier.attest(leafJs(VK_HASH, signals));
    await escrow.release(tradeId, proof.nullifier, proof.claimCommit, ATT);
    await expect(escrow.release(tradeId, proof.nullifier, proof.claimCommit, ATT))
      .to.be.revertedWithCustomError(escrow, "TradeNotLocked");
    await time.increase(7200);
    await expect(escrow.connect(seller).refund(tradeId)).to.be.revertedWithCustomError(escrow, "TradeNotLocked");
  });

  it("refund: only the seller, only after the deadline", async () => {
    const { escrow, usdc, seller, stranger, tradeId } = await lockedTrade();
    await expect(escrow.connect(seller).refund(tradeId)).to.be.revertedWithCustomError(escrow, "DeadlineNotReached");
    await time.increase(3601);
    await expect(escrow.connect(stranger).refund(tradeId)).to.be.revertedWithCustomError(escrow, "NotSeller");
    await escrow.connect(seller).refund(tradeId);
    expect(await usdc.balanceOf(seller.address)).to.equal(USDC(1000));
  });

  it("rejects duplicate, zero and out-of-field trade ids and past deadlines", async () => {
    const { escrow, seller, buyer, deadline } = await deploy();
    await escrow.connect(seller).lock(5n, buyer.address, USDC(1), 1n, deadline);
    await expect(escrow.connect(seller).lock(5n, buyer.address, USDC(1), 1n, deadline)).to.be.revertedWithCustomError(escrow, "TradeExists");
    await expect(escrow.connect(seller).lock(0n, buyer.address, USDC(1), 1n, deadline)).to.be.revertedWithCustomError(escrow, "InvalidTrade");
    const field = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    await expect(escrow.connect(seller).lock(field, buyer.address, USDC(1), 1n, deadline)).to.be.revertedWithCustomError(escrow, "InvalidTrade");
    const past = BigInt(await time.latest()) - 1n;
    await expect(escrow.connect(seller).lock(6n, buyer.address, USDC(1), 1n, past)).to.be.revertedWithCustomError(escrow, "DeadlinePassed");
  });

  it("rejects public inputs outside the SNARK field (r itself and r + 1)", async () => {
    const { escrow, tradeId, proof } = await lockedTrade();
    const r = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    await expect(escrow.release(tradeId, r, proof.claimCommit, ATT)).to.be.revertedWithCustomError(escrow, "InputOutOfField");
    await expect(escrow.release(tradeId, proof.nullifier, r + 1n, ATT)).to.be.revertedWithCustomError(escrow, "InputOutOfField");
  });

  it("only the agent can release: a buyer with a self-made attested proof is refused", async () => {
    const { escrow, verifier, buyer, stranger, tradeId, proof, signals } = await lockedTrade();
    await verifier.attest(leafJs(VK_HASH, signals));
    for (const who of [buyer, stranger]) {
      await expect(escrow.connect(who).release(tradeId, proof.nullifier, proof.claimCommit, ATT))
        .to.be.revertedWithCustomError(escrow, "NotAgent");
    }
  });

  it("refuses a release after the deadline, so release and refund never overlap", async () => {
    const { escrow, verifier, tradeId, proof, signals } = await lockedTrade();
    await verifier.attest(leafJs(VK_HASH, signals));
    await time.increase(3601);
    await expect(escrow.release(tradeId, proof.nullifier, proof.claimCommit, ATT))
      .to.be.revertedWithCustomError(escrow, "DeadlinePassed");
  });

  it("refuses an attestation from another aggregation domain", async () => {
    const { escrow, verifier, tradeId, proof, signals } = await lockedTrade();
    await verifier.attest(leafJs(VK_HASH, signals));
    await expect(escrow.release(tradeId, proof.nullifier, proof.claimCommit, { ...ATT, domainId: 99 }))
      .to.be.revertedWithCustomError(escrow, "WrongDomain");
  });
});
