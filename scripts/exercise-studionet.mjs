import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const address = process.env.NEXT_PUBLIC_TRIALDRIFT_ADDRESS ?? "0x842e70DbBb096DcAeA3eE2ad8d85B4A69eac4e2d";
const readClient = createClient({ chain: studionet, account: createAccount() });
const openerAccount = createAccount(generatePrivateKey());
const contributorAccount = createAccount(generatePrivateKey());
const reviewerAccount = createAccount(generatePrivateKey());
const opener = createClient({ chain: studionet, account: openerAccount });
const contributor = createClient({ chain: studionet, account: contributorAccount });
const reviewer = createClient({ chain: studionet, account: reviewerAccount });

async function wait(hash, label) {
  console.log(`${label}: ${hash}`);
  const receipt = await readClient.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 90 });
  console.log(`${label} status: ${receipt.statusName ?? receipt.status}`);
  return hash;
}

async function write(client, label, functionName, args, value = 0n) {
  const hash = await client.writeContract({ address, functionName, args, value });
  return wait(hash, label);
}

async function latestId() {
  const count = Number(await readClient.readContract({ address, functionName: "get_claim_count", args: [] }));
  return await readClient.readContract({ address, functionName: "get_claim_id", args: [count - 1] });
}

async function claim(id) {
  return await readClient.readContract({ address, functionName: "get_claim", args: [id], jsonSafeReturn: true });
}

async function evidence(id) {
  return await readClient.readContract({ address, functionName: "get_evidence_page", args: [id, 0n, 20n], jsonSafeReturn: true });
}

console.log(`Contract: ${address}`);
console.log(`Opener: ${openerAccount.address}`);
console.log(`Contributor: ${contributorAccount.address}`);
console.log(`Reviewer: ${reviewerAccount.address}`);

const txs = [];
txs.push(["open_claim", await write(opener, "open claim dossier", "open_claim", [
  "Diabetes prevention public claim dossier",
  "Public claim says metformin prevents type 2 diabetes in high-risk adults based on a named clinical trial.",
  "Resolve whether public wording is supported, contradicted, overstated, stale, or unknown from public sources.",
])]);
const id = await latestId();

txs.push(["add_evidence claim", await write(contributor, "add claim artifact", "add_evidence", [
  id,
  "CLAIM",
  "https://clinicaltrials.gov/study/NCT00000419",
  "sha256:93d7079e65b8f5a6fded4ea4c0769c7d248440674495168bb91c822edf9debef",
  "Claim artifact points at a public trial registry page for comparison.",
])]);

txs.push(["add_evidence trial", await write(contributor, "add trial source", "add_evidence", [
  id,
  "TRIAL",
  "https://clinicaltrials.gov/study/NCT00000419",
  "sha256:b0cbf40e8d6412b977dd243363569b5c5eff6fb5be1f55d6bc91b9033d4a7b81",
  "Official trial registry source to fetch during consensus.",
])]);

txs.push(["resolve_claim", await write(reviewer, "resolve claim state", "resolve_claim", [id])]);
console.log("after resolve:", JSON.stringify(await claim(id), null, 2));
console.log("evidence:", JSON.stringify(await evidence(id), null, 2));

txs.push(["challenge_state", await write(reviewer, "bonded state challenge", "challenge_state", [
  id,
  "STALE",
  "Fresh review requested after a public-source drift challenge.",
], 1n)]);

console.log("waiting 310 seconds for review cooldown...");
await new Promise((resolve) => setTimeout(resolve, 310_000));

txs.push(["refresh_unknown", await write(reviewer, "refresh stale claim", "refresh_unknown", [id])]);
console.log("after refresh:", JSON.stringify(await claim(id), null, 2));

console.log("transactions:");
for (const [label, hash] of txs) console.log(`- ${label}: ${hash}`);
