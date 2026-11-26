import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lib"))
sys.path.insert(0, str(ROOT / "hooks"))


@pytest.fixture(scope="session")
def cfg():
    """The committed example config, with _example taken off so the rules can be exercised.
    Never the private overlay: tests must not depend on real business values."""
    from nearsite_core import config
    c = config.load(config.CONFIG_PATH)
    c["pricing"].pop("_example", None)
    return c


@pytest.fixture(scope="session")
def fx():
    return json.loads((ROOT / "fixtures" / "claims.json").read_text())


@pytest.fixture
def claims(fx):
    return {c["nearsite_claim_id"]: c for c in fx["claims"]}


@pytest.fixture
def verified_home(fx, claims):
    c = claims["90003"]
    base = next(h for h in c["internal_homes"] if h["home_id"] == "9900000140")
    return {**base, **fx["verified"]["90003:9900000140"]}


@pytest.fixture
def live_cfg(cfg):
    c = json.loads(json.dumps(cfg))
    c["live"] = {k: True for k in c["live"]}
    c["nearsite"]["proposal_contact"] = {"name": "Test", "phone": "000"}
    return c
