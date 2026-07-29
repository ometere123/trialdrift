# TrialDrift Decision Record

TrialDrift is a living clinical-claim docket. It lets people open public claim files, attach source evidence over time, challenge stale states, and ask GenLayer validators to resolve the claim's current state.

## Candidate Set

| Candidate | Capability Surface | Native GEN | Evaluation |
|---|---|---:|---|
| TrialDrift | Web fetch, evidence timelines, semantic claim-state consensus, challenge bonds | Yes | Chosen after rework. It is structurally different from escrow/bounty apps and has repeat public use. |
| TrialVault | Private medical-document attestations, image/PDF evidence | Optional | Useful, but privacy concerns make a clean frontend-only submission harder. |
| LabelCrosscheck | Image evidence, web fetch, allergen/label judgement | Yes | Strong, but too close to product-safety bounty territory. |
| DocketSignal | Public docket/PDF material-change state | Optional | High-value, but brittle because source formats vary widely. |
| MethodWatch | Research-method claim drift across preprints and papers | Optional | Strong semantic surface, but narrower initial audience. |
| PolicyDrift Rooms | Policy/ToS semantic state tracking | Optional | Useful, but less native to GenLayer value flows. |
| DataFresh Bond | API freshness challenge, slashing, insurance | Yes | Protocol-native, but many cases become deterministic uptime checks. |
| AdReceipt Dispute | Receipt screenshot plus public policy source comparison | Yes | Good visual evidence surface, but private receipts complicate public showcase value. |
| SourceQuorum | Multi-source corroboration state for public claims | Optional | Similar to TrialDrift, but less focused and easier to look generic. |

## Why This One

Clinical claims drift. A public claim can be supported, contradicted, overstated, stale, or unknown depending on what the current evidence says. That is not a one-shot escrow outcome. It is a living state problem.

TrialDrift uses deterministic storage for the docket and GenLayer consensus for the semantic state. The product breaks if a single operator privately assigns that state.

## Gates

**Gate A, counterfactual:** without GenLayer, the app operator decides whether a claim is supported or overstated. Public readers must trust that operator.

**Gate B, distrusting parties:** claim openers, evidence contributors, challengers, and public readers have different incentives. A challenger can bond a stale-state review, but cannot directly decide the outcome.

**Gate C, irreducibly semantic:** the core question is not whether a URL exists. Validators compare fetched evidence meaning against a clinical claim and classify it into one of five state bands.

**Gate D, contract-fetched evidence:** URLs and notes are inputs. The contract fetches evidence text inside consensus before resolving state.

**Gate E, repeat use:** claim files can evolve as new sources appear. Users can return to add evidence, challenge stale states, and refresh unknown claims.

**Gate F, path beyond submission:** add source presets, claim templates, evidence quality scoring, public watchlists, and profile reputation from resolved claim states.

**Gate G, latency:** opening a claim and adding evidence are fast deterministic writes. The slow step is separate and permissionless: `resolve_claim` or `refresh_unknown`.

## Non-Determinism Budget

One consensus resolution fetches up to four evidence URLs, then classifies the bundle into:

- `SUPPORTED`
- `CONTRADICTED`
- `OVERSTATED`
- `STALE`
- `UNKNOWN`

The equivalence principle compares meaning and final state, not formatting.

## Abstention

`UNKNOWN` is mandatory when evidence cannot be fetched, pages are too broad, identifiers are missing, or the bundle is ambiguous. This is central to the product because a living docket must preserve uncertainty instead of converting it into fake certainty.

## Self-Audit

This rework deliberately moves away from the earlier escrow-shaped design. Native GEN is now used for bonded challenges, not as the main product skeleton. The unique part is the evolving claim-state docket, evidence timeline, stale challenge, and consensus refresh loop.
