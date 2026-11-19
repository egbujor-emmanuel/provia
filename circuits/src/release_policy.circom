pragma circom 2.1.9;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

// Provia release policy (PRD §6).
// Proves that a zkTLS-attested payment satisfies the trade's release rules,
// and emits a nullifier so one payment can never release twice.
template ReleasePolicy() {
    // Public inputs
    signal input tradeId;
    signal input recipient;
    signal input priceKobo;
    signal input deadline;
    signal input claimCommit;

    // Private inputs: fields revealed by the zkTLS (Reclaim) proof of Paystack's verify response
    signal input paidKobo;
    signal input paidAt;
    signal input refHi;
    signal input refLo;
    signal input currency;
    signal input statusOk;

    // Public output
    signal output nullifier;

    // Range-check every value fed to a comparator so field wrap-around cannot fake an inequality.
    component bits[4];
    bits[0] = Num2Bits(64); bits[0].in <== paidKobo;
    bits[1] = Num2Bits(64); bits[1].in <== priceKobo;
    bits[2] = Num2Bits(64); bits[2].in <== paidAt;
    bits[3] = Num2Bits(64); bits[3].in <== deadline;

    // Paystack said "success" and the currency is NGN (ISO 4217 numeric 566).
    statusOk === 1;
    currency === 566;

    // Paid at least the agreed price.
    component enough = GreaterEqThan(64);
    enough.in[0] <== paidKobo;
    enough.in[1] <== priceKobo;
    enough.out === 1;

    // Paid on or before the trade deadline.
    component onTime = LessEqThan(64);
    onTime.in[0] <== paidAt;
    onTime.in[1] <== deadline;
    onTime.out === 1;

    // Bind the proof to exactly these zkTLS-revealed fields and to this trade.
    component commit = Poseidon(7);
    commit.inputs[0] <== paidKobo;
    commit.inputs[1] <== paidAt;
    commit.inputs[2] <== refHi;
    commit.inputs[3] <== refLo;
    commit.inputs[4] <== currency;
    commit.inputs[5] <== statusOk;
    commit.inputs[6] <== tradeId;
    commit.out === claimCommit;

    // One Paystack reference, one release, ever.
    component nul = Poseidon(2);
    nul.inputs[0] <== refHi;
    nul.inputs[1] <== refLo;
    nullifier <== nul.out;

    // Bind recipient so the proof cannot be replayed to a different payout address.
    signal recipientSquared;
    recipientSquared <== recipient * recipient;
}

component main {public [tradeId, recipient, priceKobo, deadline, claimCommit]} = ReleasePolicy();
