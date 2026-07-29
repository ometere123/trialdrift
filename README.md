# TrialDrift

TrialDrift is a living public docket for clinical claims. A user opens a claim file, contributors attach public evidence over time, and GenLayer validators resolve the current claim state as `SUPPORTED`, `CONTRADICTED`, `OVERSTATED`, `STALE`, or `UNKNOWN`.

This is not an escrow board. The product is the claim file: an evolving evidence timeline with a consensus-backed state.

## Why GenLayer Is Central

Delete GenLayer and one operator decides what the claim means. That breaks the workflow because public clinical claims are often ambiguous: a registry page may be broad, a claim may overstate a trial, or evidence may become stale after a new source appears.

The contract stores deterministic structure:

- claim files
- bounded evidence timelines
- source hashes and notes
- challenge bonds
- cooldowns and review counts
- profile activity

GenLayer handles the semantic question: what does the fetched evidence bundle say about the claim right now?

## Deployed Contract

- StudioNet contract: `0x842e70DbBb096DcAeA3eE2ad8d85B4A69eac4e2d`
- Explorer: `https://explorer-studio.genlayer.com/address/0x842e70DbBb096DcAeA3eE2ad8d85B4A69eac4e2d`
- Deploy tx: `0xe8635be9050f95010561340ac50e78d1d97769b33b7b60e03d57d0527899f9f2`

## Contract Surface

Views:

- `get_claim_count`
- `get_claim_id`
- `get_claim`
- `get_claim_page`
- `get_evidence_count`
- `get_evidence_page`
- `get_party_claim_page`
- `get_profile`

Writes:

- `open_claim(title, claim_text, public_context)`
- `add_evidence(claim_id, kind, url, content_hash, note)`
- `challenge_state(claim_id, proposed_state, note)` payable
- `resolve_claim(claim_id)`
- `refresh_unknown(claim_id)`

Evidence kinds are `CLAIM`, `TRIAL`, `COUNTER`, and `CONTEXT`.

## Measured Results

Final gates after the rewrite:

- `genvm-lint check contracts/trial_drift.py --json`: passed
- `python -m pytest tests/direct -v`: `25 passed`
- `gltest tests/integration -v -s --network studionet`: passed
- `npm run verify:schema`: 13 frontend call sites verified against the deployed schema
- `npm run lint`: passed
- `npm run build`: passed

On-chain writes exercised on StudioNet:

- `open_claim`: `0x3ee451c0b8808589f4f5ce2b26be29be436df2b5936f766fd53e4220135af7b1`
- `add_evidence` claim artifact: `0xb8bbc19172471dbc9d8579faddff548835d30dcaca66b0674226aaa013807269`
- `add_evidence` trial source: `0xda9c97be935620a116dcd92a898da0520d33d7218631f8d48d5c7226b1e9b4ee`
- `resolve_claim`: `0x504c0fb1a6212a6ec1e11892122b90034e67e5bad290b6787d06d0fb11790610`
- `challenge_state`: `0x898fdbde27ffbb89e4ec211ea996b84ea7d0aab9522e49adc62d94c5702c81a9`
- `refresh_unknown`: `0xe7175314ebb060e04706972c5a978d78b8befb530186482bd58c29c0fd739e2a`

Measured claim result:

- claim: `TD-1`
- evidence entries: `2`
- first consensus state: `UNKNOWN`
- after bonded challenge and cooldown refresh: `UNKNOWN`
- reason: validators fetched generic ClinicalTrials pages/glossary content rather than usable study details, so the contract refused to treat the claim as supported

That is the intended behavior. Broad or insufficient evidence is not silently promoted into proof.

## Frontend

The app uses Next.js App Router, TypeScript strict mode, Tailwind, and `genlayer-js@1.1.8`.

Pages:

- `/` narrative landing page
- `/cases` public docket
- `/open` open a claim file
- `/evidence` evidence room
- `/review` consensus chamber
- `/history` connected wallet trail
- `/case/[id]` claim dossier deep link
- `/profile/[address]` profile activity

## Environment

```bash
NEXT_PUBLIC_GENLAYER_CHAIN=studionet
NEXT_PUBLIC_TRIALDRIFT_ADDRESS=0x842e70DbBb096DcAeA3eE2ad8d85B4A69eac4e2d
NEXT_PUBLIC_GENLAYER_EXPLORER=https://explorer-studio.genlayer.com
NEXT_PUBLIC_GENLAYER_RPC_ENDPOINT=/api/genlayer-rpc
GENLAYER_RPC_URL=https://studio.genlayer.com/api
```

## Honest Limits

StudioNet balances are simulated. The payable challenge path demonstrates contract behavior in StudioNet, not mainnet settlement.

Some public pages render as glossary or index content to validators. TrialDrift records `UNKNOWN` for that case and keeps the dossier open for better evidence instead of guessing.
