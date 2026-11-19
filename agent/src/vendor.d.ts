// Minimal declarations for the untyped libraries Provia calls, limited to what it uses.
declare module 'snarkjs' {
  export interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }
  export const groth16: {
    fullProve(input: Record<string, string>, wasmPath: string, zkeyPath: string): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
    verify(vk: object, publicSignals: readonly string[], proof: Groth16Proof): Promise<boolean>;
  };
}

declare module 'circomlibjs' {
  interface PoseidonField {
    toObject(x: unknown): bigint;
  }
  interface Poseidon {
    (inputs: bigint[]): unknown;
    F: PoseidonField;
  }
  export function buildPoseidon(): Promise<Poseidon>;
}
