#!/usr/bin/env bash
# Compile release_policy.circom, run a local Groth16 setup, export the verification key.
# NOTE: the powers-of-tau ceremony below is a local development ceremony, as in the
# official zkVerify tutorials. A production deployment needs a multi-party ceremony.
set -euo pipefail
cd "$(dirname "$0")/.."
SNARKJS="node ../node_modules/snarkjs/build/cli.cjs"
mkdir -p build
circom src/release_policy.circom --r1cs --wasm --sym -o build
if [ ! -f build/pot14_final.ptau ]; then
  $SNARKJS powersoftau new bn128 14 build/pot14_0000.ptau
  $SNARKJS powersoftau contribute build/pot14_0000.ptau build/pot14_0001.ptau --name="provia dev ptau" -e="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  $SNARKJS powersoftau prepare phase2 build/pot14_0001.ptau build/pot14_final.ptau
fi
$SNARKJS groth16 setup build/release_policy.r1cs build/pot14_final.ptau build/release_policy_0000.zkey
$SNARKJS zkey contribute build/release_policy_0000.zkey build/release_policy_final.zkey --name="provia dev zkey" -e="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
$SNARKJS zkey export verificationkey build/release_policy_final.zkey build/verification_key.json
$SNARKJS r1cs info build/release_policy.r1cs
echo "build ok"
