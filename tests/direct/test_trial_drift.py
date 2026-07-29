import json


def warp_to(direct_vm, iso: str) -> None:
    direct_vm.warp(iso)
    import sys

    gl = sys.modules.get("genlayer.gl")
    if gl is None:
        return
    raw = getattr(gl, "message_raw", None)
    if isinstance(raw, dict):
        raw["datetime"] = iso
    nested = getattr(getattr(gl, "message", None), "raw", None)
    if isinstance(nested, dict):
        nested["datetime"] = iso


GOOD_HASH = "sha256:" + ("a" * 64)


def open_claim(direct_vm, contract, opener):
    direct_vm.sender = opener
    return contract.open_claim(
        "Metformin diabetes prevention claim",
        "Public claim says metformin prevents type 2 diabetes in high-risk adults.",
        "Compare public claim wording against registry and corroborating trial sources.",
    )


def add_evidence(direct_vm, contract, author, claim_id, kind="TRIAL", url="https://clinicaltrials.gov/study/NCT00000419", note="Official trial registry evidence."):
    direct_vm.sender = author
    return contract.add_evidence(claim_id, kind, url, GOOD_HASH, note)


def mock_state(direct_vm, state="SUPPORTED", confidence="HIGH"):
    direct_vm.mock_web(r".*clinicaltrials\.gov.*", {"status": 200, "body": "ClinicalTrials.gov record for metformin diabetes prevention outcome."})
    direct_vm.mock_web(r".*claims\.example\.test.*", {"status": 200, "body": "Public claim artifact about metformin prevention."})
    direct_vm.mock_llm(
        r".*TrialDrift clinical-claim dossier.*",
        json.dumps({"state": state, "confidence_band": confidence, "reason": "The evidence bundle supports this state."}),
    )


def test_initial_count_zero(deploy_trial):
    assert deploy_trial.get_claim_count() == 0


def test_open_claim_stores_fields(direct_vm, deploy_trial, direct_alice):
    warp_to(direct_vm, "2026-07-28T10:00:00Z")
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    claim = deploy_trial.get_claim(claim_id)
    assert claim["claim_id"] == "TD-1"
    assert claim["opener"].lower() == str(direct_alice).lower()
    assert claim["state"] == "UNREVIEWED"
    assert claim["created_at"].endswith("Z")


def test_open_claim_rejects_short_title(direct_vm, deploy_trial, direct_alice):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Invalid title"):
        deploy_trial.open_claim("No", "Valid claim text", "Valid context text")


def test_open_claim_caps_page(direct_vm, deploy_trial, direct_alice):
    for _ in range(22):
        open_claim(direct_vm, deploy_trial, direct_alice)
    assert len(deploy_trial.get_claim_page(0, 50)) == 20


def test_get_claim_id_bounds(direct_vm, deploy_trial, direct_alice):
    open_claim(direct_vm, deploy_trial, direct_alice)
    assert deploy_trial.get_claim_id(0) == "TD-1"
    with direct_vm.expect_revert("Claim index out of range"):
        deploy_trial.get_claim_id(1)


def test_add_evidence_stores_timeline(direct_vm, deploy_trial, direct_alice, direct_bob):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    evidence_id = add_evidence(direct_vm, deploy_trial, direct_bob, claim_id)
    rows = deploy_trial.get_evidence_page(claim_id, 0, 10)
    assert evidence_id == "TD-1-E1"
    assert rows[0]["kind"] == "TRIAL"
    assert rows[0]["author"].lower() == str(direct_bob).lower()
    assert deploy_trial.get_claim(claim_id)["evidence_count"] == "1"


def test_add_evidence_rejects_bad_kind(direct_vm, deploy_trial, direct_alice, direct_bob):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Invalid evidence kind"):
        deploy_trial.add_evidence(claim_id, "BLOG", "https://clinicaltrials.gov/study/NCT00000419", GOOD_HASH, "Bad kind")


def test_add_evidence_rejects_non_https(direct_vm, deploy_trial, direct_alice, direct_bob):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("must start with https://"):
        deploy_trial.add_evidence(claim_id, "TRIAL", "http://clinicaltrials.gov/study/NCT00000419", GOOD_HASH, "Bad URL")


def test_add_evidence_rejects_bad_hash(direct_vm, deploy_trial, direct_alice, direct_bob):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("sha256 plus 64 hex"):
        deploy_trial.add_evidence(claim_id, "TRIAL", "https://clinicaltrials.gov/study/NCT00000419", "sha256:abc", "Bad hash")


def test_resolve_requires_two_evidence_entries(direct_vm, deploy_trial, direct_alice, direct_bob):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id)
    with direct_vm.expect_revert("At least two evidence entries"):
        deploy_trial.resolve_claim(claim_id)


def test_resolve_supported_state(direct_vm, deploy_trial, direct_alice, direct_bob, direct_charlie):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "CLAIM", "https://claims.example.test/metformin")
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "TRIAL")
    mock_state(direct_vm, "SUPPORTED", "HIGH")
    direct_vm.sender = direct_charlie
    deploy_trial.resolve_claim(claim_id)
    claim = deploy_trial.get_claim(claim_id)
    assert claim["state"] == "SUPPORTED"
    assert claim["confidence_band"] == "HIGH"
    assert claim["review_count"] == "1"


def test_resolve_contradicted_state(direct_vm, deploy_trial, direct_alice, direct_bob):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "CLAIM", "https://claims.example.test/metformin")
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "COUNTER")
    mock_state(direct_vm, "CONTRADICTED", "MEDIUM")
    deploy_trial.resolve_claim(claim_id)
    assert deploy_trial.get_claim(claim_id)["state"] == "CONTRADICTED"


def test_resolve_overstated_state(direct_vm, deploy_trial, direct_alice, direct_bob):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "CLAIM", "https://claims.example.test/metformin")
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "TRIAL")
    mock_state(direct_vm, "OVERSTATED", "MEDIUM")
    deploy_trial.resolve_claim(claim_id)
    assert deploy_trial.get_claim(claim_id)["state"] == "OVERSTATED"


def test_resolve_unknown_on_fetch_failure(direct_vm, deploy_trial, direct_alice, direct_bob):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "CLAIM", "https://blocked.example.test/claim")
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "TRIAL", "https://blocked.example.test/trial")
    direct_vm.mock_llm(r".*EXTERNAL: evidence fetch failed.*", json.dumps({"state": "UNKNOWN", "confidence_band": "LOW", "reason": "Evidence could not be fetched."}))
    deploy_trial.resolve_claim(claim_id)
    assert deploy_trial.get_claim(claim_id)["state"] == "UNKNOWN"


def test_add_evidence_after_resolution_marks_stale(direct_vm, deploy_trial, direct_alice, direct_bob):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "CLAIM", "https://claims.example.test/metformin")
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "TRIAL")
    mock_state(direct_vm, "SUPPORTED", "HIGH")
    deploy_trial.resolve_claim(claim_id)
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "CONTEXT")
    assert deploy_trial.get_claim(claim_id)["state"] == "STALE"


def test_challenge_requires_bond(direct_vm, deploy_trial, direct_alice, direct_bob):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = 0
    with direct_vm.expect_revert("Review bond is required"):
        deploy_trial.challenge_state(claim_id, "STALE", "Needs review")


def test_challenge_marks_stale_and_records_bond(direct_vm, deploy_trial, direct_alice, direct_bob):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = 1
    deploy_trial.challenge_state(claim_id, "STALE", "Evidence drift challenge")
    direct_vm.value = 0
    claim = deploy_trial.get_claim(claim_id)
    assert claim["state"] == "STALE"
    assert claim["review_bond"] == "1"


def test_refresh_unknown_requires_unknown_or_stale(direct_vm, deploy_trial, direct_alice):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    with direct_vm.expect_revert("not unknown or stale"):
        deploy_trial.refresh_unknown(claim_id)


def test_refresh_unknown_resolves_again_after_cooldown(direct_vm, deploy_trial, direct_alice, direct_bob):
    warp_to(direct_vm, "2026-07-28T10:00:00Z")
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "CLAIM", "https://claims.example.test/metformin")
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "TRIAL")
    mock_state(direct_vm, "UNKNOWN", "LOW")
    deploy_trial.resolve_claim(claim_id)
    warp_to(direct_vm, "2026-07-28T10:05:00Z")
    mock_state(direct_vm, "SUPPORTED", "HIGH")
    deploy_trial.refresh_unknown(claim_id)
    claim = deploy_trial.get_claim(claim_id)
    assert claim["review_count"] == "2"
    assert claim["last_review_at"].startswith("2026-07-28T10:05:00")


def test_cooldown_before_boundary_blocks(direct_vm, deploy_trial, direct_alice, direct_bob):
    warp_to(direct_vm, "2026-07-28T10:00:00Z")
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "CLAIM", "https://claims.example.test/metformin")
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "TRIAL")
    mock_state(direct_vm, "UNKNOWN", "LOW")
    deploy_trial.resolve_claim(claim_id)
    warp_to(direct_vm, "2026-07-28T10:04:59Z")
    with direct_vm.expect_revert("Review cooldown active"):
        deploy_trial.refresh_unknown(claim_id)


def test_evidence_page_limits_to_twenty(direct_vm, deploy_trial, direct_alice, direct_bob):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    for _ in range(12):
        add_evidence(direct_vm, deploy_trial, direct_bob, claim_id)
    assert len(deploy_trial.get_evidence_page(claim_id, 0, 50)) == 12


def test_evidence_cap_blocks_thirteenth(direct_vm, deploy_trial, direct_alice, direct_bob):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    for _ in range(12):
        add_evidence(direct_vm, deploy_trial, direct_bob, claim_id)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Evidence cap reached"):
        deploy_trial.add_evidence(claim_id, "TRIAL", "https://clinicaltrials.gov/study/NCT00000419", GOOD_HASH, "Cap test")


def test_party_claim_page_tracks_opened_claim(direct_vm, deploy_trial, direct_alice):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    page = deploy_trial.get_party_claim_page(direct_alice, 0, 10)
    assert page[0]["claim_id"] == claim_id


def test_profile_counts(direct_vm, deploy_trial, direct_alice, direct_bob, direct_charlie):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "CLAIM", "https://claims.example.test/metformin")
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "TRIAL")
    direct_vm.sender = direct_charlie
    direct_vm.value = 1
    deploy_trial.challenge_state(claim_id, "STALE", "Challenge")
    direct_vm.value = 0
    mock_state(direct_vm, "SUPPORTED", "HIGH")
    deploy_trial.resolve_claim(claim_id)
    assert deploy_trial.get_profile(direct_alice)["opened"] == "1"
    assert deploy_trial.get_profile(direct_bob)["evidence_added"] == "2"
    assert deploy_trial.get_profile(direct_charlie)["challenged"] == "1"


def test_unknown_resolution_bumps_reviewer_unknown_count(direct_vm, deploy_trial, direct_alice, direct_bob, direct_charlie):
    claim_id = open_claim(direct_vm, deploy_trial, direct_alice)
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "CLAIM", "https://blocked.example.test/claim")
    add_evidence(direct_vm, deploy_trial, direct_bob, claim_id, "TRIAL", "https://blocked.example.test/trial")
    direct_vm.mock_llm(r".*EXTERNAL: evidence fetch failed.*", json.dumps({"state": "UNKNOWN", "confidence_band": "LOW", "reason": "Evidence could not be fetched."}))
    direct_vm.sender = direct_charlie
    deploy_trial.resolve_claim(claim_id)
    assert deploy_trial.get_profile(direct_charlie)["unknowns"] == "1"
