import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import type { Address } from "viem";
import type { CalldataEncodable, Network } from "genlayer-js/types";

export const CHAIN_NAME = process.env.NEXT_PUBLIC_GENLAYER_CHAIN ?? "studionet";

const CHAINS = {
  studionet,
  localnet,
  testnetAsimov,
  testnetBradbury,
} as const;

export const chain = CHAINS[CHAIN_NAME as keyof typeof CHAINS] ?? studionet;
export const contractAddress = (process.env.NEXT_PUBLIC_TRIALDRIFT_ADDRESS ??
  "0x842e70DbBb096DcAeA3eE2ad8d85B4A69eac4e2d") as Address;
export const explorerBase = process.env.NEXT_PUBLIC_GENLAYER_EXPLORER ?? "https://explorer-studio.genlayer.com";
export const rpcEndpoint = process.env.NEXT_PUBLIC_GENLAYER_RPC_ENDPOINT ?? "/api/genlayer-rpc";

export function makeReadClient() {
  return createClient({ chain, endpoint: rpcEndpoint, account: createAccount() });
}

export function makeGeneratedWallet() {
  const privateKey = generatePrivateKey();
  return { privateKey, account: createAccount(privateKey) };
}

export function makeLocalWriteClient(privateKey: `0x${string}`) {
  return createClient({ chain, endpoint: rpcEndpoint, account: createAccount(privateKey) });
}

export async function makeInjectedWriteClient(address: Address) {
  const client = createClient({ chain, endpoint: rpcEndpoint, account: address });
  await client.connect(CHAIN_NAME as Network);
  return client;
}

export type ClaimState = "UNREVIEWED" | "SUPPORTED" | "CONTRADICTED" | "OVERSTATED" | "STALE" | "UNKNOWN";

export type ClaimRecord = {
  claim_id: string;
  opener: string;
  title: string;
  claim_text: string;
  public_context: string;
  created_at: string;
  updated_at: string;
  state: ClaimState;
  confidence_band: string;
  reason: string;
  reviewer: string;
  review_bond: string;
  review_count: string;
  last_review_at: string;
  evidence_count: string;
};

export type EvidenceRecord = {
  evidence_id: string;
  author: string;
  kind: "CLAIM" | "TRIAL" | "COUNTER" | "CONTEXT";
  url: string;
  content_hash: string;
  note: string;
  added_at: string;
};

export type ProfileRecord = {
  address: string;
  opened: string;
  evidence_added: string;
  challenged: string;
  resolved: string;
  unknowns: string;
};

export const requiredContractFunctions = [
  "get_claim_count",
  "get_claim_id",
  "get_claim",
  "get_claim_page",
  "get_evidence_count",
  "get_evidence_page",
  "get_party_claim_page",
  "get_profile",
  "open_claim",
  "add_evidence",
  "challenge_state",
  "resolve_claim",
  "refresh_unknown",
] as const;

export type { Address, CalldataEncodable };





