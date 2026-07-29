import { createAccount, createClient } from "genlayer-js";
import { studionet, localnet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";

const chainName = process.env.NEXT_PUBLIC_GENLAYER_CHAIN ?? "studionet";
const chains = { studionet, localnet, testnetAsimov, testnetBradbury };
const chain = chains[chainName] ?? studionet;
const address = process.env.NEXT_PUBLIC_TRIALDRIFT_ADDRESS ?? "0x842e70DbBb096DcAeA3eE2ad8d85B4A69eac4e2d";

const required = [
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
];

if (!address || address === "0x0000000000000000000000000000000000000000") {
  console.error("NEXT_PUBLIC_TRIALDRIFT_ADDRESS is required.");
  process.exit(1);
}

const client = createClient({ chain, account: createAccount() });
const schema = await client.getContractSchema(address);
const rawMethods = schema.methods ?? {};
const methods = Array.isArray(rawMethods)
  ? new Set(rawMethods.map((method) => method.name))
  : new Set(Object.keys(rawMethods));
const missing = required.filter((name) => !methods.has(name));

if (missing.length) {
  console.error(`Missing contract methods: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`Schema OK for ${address}. Verified ${required.length} frontend call sites.`);




