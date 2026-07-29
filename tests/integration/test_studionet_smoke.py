from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded


def test_studionet_deterministic_surface():
    factory = get_contract_factory("TrialDrift")
    contract = factory.deploy(args=[])
    tx = contract.open_claim(
        args=[
            "Integration claim dossier",
            "A public clinical claim needs a living evidence file.",
            "Verify deterministic claim indexing and evidence storage on StudioNet.",
        ]
    ).transact()
    assert tx_execution_succeeded(tx)
    assert contract.get_claim_count(args=[]).call() == 1
    claim = contract.get_claim(args=["TD-1"]).call()
    assert claim["state"] == "UNREVIEWED"
    evidence_tx = contract.add_evidence(
        args=[
            "TD-1",
            "TRIAL",
            "https://clinicaltrials.gov/study/NCT00000419",
            "sha256:" + ("a" * 64),
            "Official registry source for the claim file.",
        ]
    ).transact()
    assert tx_execution_succeeded(evidence_tx)
    assert contract.get_evidence_count(args=["TD-1"]).call() == 1

