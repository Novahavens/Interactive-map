import json
from datetime import datetime, time, timezone

import pytest

from nearsite_core import checker, claims as C, config, messages, payloads, pricing, scoring, slack_card, state, templates, tickets

NOW = datetime(2026, 11, 26, 18, tzinfo=timezone.utc)


# ---------- config ----------
def test_everything_ships_switched_off(cfg):
    assert cfg["live"]["master"] is False
    assert not any(cfg["live"][s] for s in config.LIVE_SWITCHES)
    assert not any(config.is_live(s, cfg, {"NEARSITE_AGENT_LIVE": "1"}) for s in config.LIVE_SWITCHES)


def test_three_locks_needed(live_cfg):
    assert config.is_live("quo_texts", live_cfg, {"NEARSITE_AGENT_LIVE": "1"})
    assert not config.is_live("quo_texts", live_cfg, {})
    off = {**live_cfg, "live": {**live_cfg["live"], "master": False}}
    assert not config.is_live("quo_texts", off, {"NEARSITE_AGENT_LIVE": "1"})
    assert not config.is_live("not_a_switch", live_cfg, {"NEARSITE_AGENT_LIVE": "1"})


# ---------- claims ----------
def test_notes_needs_are_read(claims):
    c = claims["90002"]
    assert {"no_stairs", "pets", "parking"} <= C.needs(c)
    assert C.parking_needed(c) == 2
    assert C.pets_count(c) == 4
    assert not C.pet_weights_known(c)
    assert C.pet_weights_known(claims["90003"])
    assert C.adults(claims["90003"]) == 2


# ---------- pricing ----------
def test_quote_nearsite_hits_target_and_stays_under_ceiling(cfg, claims, verified_home):
    p = cfg["pricing"]
    q = pricing.quote(claims["90003"], verified_home, cfg)
    assert q.fee_factor == pytest.approx(0.84)
    assert q.markup_monthly == pytest.approx(p["monthly_markup_target"], abs=1)
    assert q.quote_monthly <= claims["90003"]["budget_monthly"]
    assert q.quote_per_day == pytest.approx(q.quote_monthly / 30, abs=0.01)
    assert q.one_time["application"] == 2 * p["app_fee_per_adult"]  # 2 adults
    assert q.one_time["cleaning"] == max(p["clean_fee_min"], verified_home["owner_clean"] + p["clean_fee_upcharge"])
    assert q.one_time["pet_nonrefundable"] == max(p["pet_fee_nonref"], verified_home["owner_pet_fee"] + p["pet_fee_upcharge"])
    assert q.utility_cap == p["utility_caps"]["3"]
    assert q.deposit == verified_home["owner_deposit"]


def test_quote_capped_by_budget_flags_thin_margin(cfg, claims):
    q = pricing.quote(claims["90001"], {"owner_monthly": 2550, "bedrooms": 2}, cfg)
    assert q.capped_by_ceiling and q.quote_monthly == 4000
    assert q.markup_monthly == pytest.approx(4000 * 0.84 - 2550)
    assert q.markup_needs_management


def test_email_claim_has_no_platform_fee(cfg):
    q = pricing.quote({"source": "email", "frv": 6000, "beds": 3}, {"owner_monthly": 3000}, cfg)
    assert q.fee_factor == 1.0 and q.quote_monthly == 3000 + cfg["pricing"]["monthly_markup_target"]


# ---------- scoring ----------
def test_pets_not_allowed_is_blocked(cfg, claims):
    ranked = scoring.rank(claims["90002"], claims["90002"]["internal_homes"], cfg)
    blocked = {s.home_id for s in ranked if s.blockers}
    assert "9900000134" in blocked          # was rank 1 on the old matcher, takes no pets
    assert ranked[0].home_id != "9900000134"
    assert all(s.blockers == [] for s in ranked[: len(ranked) - len(blocked)])


def test_internal_first_external_only_when_short(cfg, claims):
    sampleton = scoring.shortlist(claims["90001"], claims["90001"]["internal_homes"], claims["90001"]["external_homes"], cfg)
    assert sampleton["internal_sufficient"] is False and sampleton["used_external"] is True
    fictionville = scoring.shortlist(claims["90002"], claims["90002"]["internal_homes"], [{"home_id": "x", "owner_monthly": 1}], cfg)
    assert fictionville["internal_sufficient"] is True and fictionville["used_external"] is False
    assert len(fictionville["homes"]) <= cfg["sourcing"]["target_homes"]


def test_management_company_is_blocked(cfg, claims):
    s = scoring.score(claims["90001"], claims["90001"]["external_homes"][2], cfg)
    assert any("management" in b for b in s.blockers)


# ---------- messages ----------
@pytest.mark.parametrize("cid", ["90001", "90002", "90003"])
def test_messages_are_clean(cfg, claims, cid):
    c = claims[cid]
    for m in (messages.in_app_draft(c, {}, cfg), messages.sona_text_task(c, {"address": "x"}, cfg),
              messages.sona_call_task(c, {"address": "x"}, cfg), messages.follow_up(c, {}, cfg)):
        assert len(m) <= 2000
        assert "TBD" not in m and "1 lbs" not in m
        assert not checker.EMAIL_RE.search(m) and not checker.PHONE_RE.search(m)
        assert "Nova Havens at Nova Havens" not in m


def test_message_carries_notes_needs(cfg, claims):
    m = messages.in_app_draft(claims["90002"], {}, cfg)
    assert "no stairs" in m and "parking for 2" in m


# ---------- checker: outreach and call ----------
def test_outreach_blocks(cfg, claims):
    c, h = claims["90003"], {"listing_url": "u"}
    ok = checker.check_outreach(c, h, "hello", {}, cfg)
    assert ok.passed
    assert not checker.check_outreach(c, {**h, "opted_out": True}, "hello", {}, cfg).passed
    assert not checker.check_outreach(c, {}, "hello", {}, cfg).passed
    assert not checker.check_outreach(c, h, "call me on 615 555 1212", {}, cfg).passed
    assert not checker.check_outreach(c, {**h, "messages_sent": 2}, "hi", {}, cfg).passed
    assert not checker.check_outreach(c, h, "hi", {"landlord_local_time": time(21, 30)}, cfg).passed
    assert not checker.check_outreach(c, h, "hi", {"thread_open_for_landlord": True}, cfg).passed
    assert not checker.check_outreach({**c, "insured_name": "Jane Roe"}, h, "for Jane Roe", {}, cfg).passed


def test_call_needs_written_consent_and_credits(cfg, claims, verified_home):
    c = claims["90003"]
    assert checker.check_call(c, verified_home, {"credits_used_this_month": 0}, cfg).passed
    assert not checker.check_call(c, {**verified_home, "call_consent": None}, {}, cfg).passed
    assert not checker.check_call(c, verified_home, {"credits_used_this_month": 860}, cfg).passed
    assert not checker.check_call(c, {**verified_home, "call_attempts": 2}, {}, cfg).passed


# ---------- checker: submit ----------
def test_submit_blocked_until_contact_and_both_approvals(cfg, live_cfg, claims, verified_home):
    c = claims["90003"]
    q = pricing.quote(c, verified_home, cfg).to_dict()
    assert cfg["nearsite"]["proposal_contact"]["name"]
    no_contact = {**cfg, "nearsite": {**cfg["nearsite"], "proposal_contact": {"name": None, "phone": None}}}
    v = checker.check_submit(c, verified_home, q, {"now": NOW}, no_contact)
    assert not v.passed and any("contact name" in b for b in v.blockers)
    v = checker.check_submit(c, verified_home, q, {"now": NOW}, cfg)
    assert not v.passed and not any("contact name" in b for b in v.blockers)
    only_w = checker.check_submit(c, verified_home, q, {"now": NOW, "approvals": {"william": "approved"}}, live_cfg)
    lou = cfg["approvals"]["people"]["lou"]["name"]
    assert not only_w.passed and any(lou in b for b in only_w.blockers)
    both = checker.check_submit(c, verified_home, q, {"now": NOW, "approvals": {"william": "approved", "lou": "approved"}}, live_cfg)
    assert both.passed, both.blockers


def test_submit_catches_each_rule(live_cfg, claims, verified_home):
    c90002 = claims["90002"]
    ap = {"now": NOW, "approvals": {"william": "approved", "lou": "approved"}}
    q = pricing.quote(c90002, verified_home, live_cfg).to_dict()
    v = checker.check_submit(c90002, {**verified_home, "single_level": False, "parking_spaces": 1}, q, ap, live_cfg)
    text = " ".join(v.blockers)
    assert "no stairs" in text and "parking for 2" in text
    c = claims["90003"]
    q = pricing.quote(c, verified_home, live_cfg).to_dict()
    cases = {
        "not been verified": {"verified": False},
        "house number": {"address": "Example Pine Ct"},
        "floor number": {"property_type": "apartment", "floor": None},
        "after the move-in": {"available_from": "2026-12-10"},
        "before the move-out": {"available_to": "2026-12-20"},
        "pets": {"pets_ok": None},
        "photo link": {"photos_url": ""},
        "bedrooms": {"bedrooms": 1},
    }
    for needle, change in cases.items():
        v = checker.check_submit(c, {**verified_home, **change}, q, ap, live_cfg)
        assert not v.passed and needle in " ".join(v.blockers), needle
    over = {**q, "quote_monthly": 9999}
    assert not checker.check_submit(c, verified_home, over, ap, live_cfg).passed
    late = {**ap, "now": datetime(2026, 12, 2, tzinfo=timezone.utc)}
    assert any("expired" in b for b in checker.check_submit(c, verified_home, q, late, live_cfg).blockers)
    email = {**c, "source": "email"}
    assert any("adjuster email" in b for b in checker.check_submit(email, verified_home, q, ap, live_cfg).blockers)


# ---------- payloads and templates ----------
def test_nearsite_payloads_follow_lous_rules(cfg, claims, verified_home):
    ap = payloads.add_property(verified_home, cfg)
    assert ap["property_name"] == "123 Example Pine Ct"
    assert ap["furnishing"] == "Furnished" and ap["max_guests"] == 6 and ap["missing"] == []
    apt = payloads.add_property({**verified_home, "property_type": "apartment", "floor": None}, cfg)
    assert "floor" in apt["missing"]
    q = pricing.quote(claims["90003"], verified_home, cfg).to_dict()
    p = payloads.proposal(claims["90003"], verified_home, q, cfg)
    assert p["base_rent_per_day"] == q["quote_per_day"] and p["notice_to_vacate_days"] == 30
    assert payloads.review_matches(p, {"base_rent_per_day": p["base_rent_per_day"]}) == []
    assert payloads.review_matches(p, {"base_rent_per_day": 1}) != []


def test_email_templates(cfg, claims, verified_home):
    assert templates.template_for("CRS Temporary Housing", cfg) == "crs"
    assert templates.template_for("Example Insurance Services", cfg) == "all_other_companies"
    q = pricing.quote({**claims["90003"], "source": "email"}, verified_home, cfg).to_dict()
    f = templates.fill(1, claims["90003"], verified_home, q, cfg)
    assert f["template"] == "all_other_companies" and "123 Example Pine Ct" in f["text"]
    d = templates.email_draft({"adjuster_email": "a@b.c"}, [f])
    assert d["status"] == "draft_only"


# ---------- slack card, state, tickets ----------
def test_slack_card_needs_both(cfg):
    card = slack_card.build("b1", [], cfg)
    ppl = cfg["approvals"]["people"]
    assert f'{ppl["william"]["name"]} and {ppl["lou"]["name"]}' in card["blocks"][1]["elements"][0]["text"]
    r = slack_card.approvals_complete([{"person": "william", "action": "approve", "batch_id": "b1"}], "b1", cfg)
    assert not r["all_approved"]
    r = slack_card.approvals_complete([{"person": "william", "action": "approve", "batch_id": "b1"},
                                       {"person": "lou", "action": "approve", "batch_id": "b1"},
                                       {"person": "lou", "action": "approve", "batch_id": "other"}], "b1", cfg)
    assert r["all_approved"]
    r = slack_card.approvals_complete([{"person": "william", "action": "approve", "batch_id": "b1"},
                                       {"person": "lou", "action": "approve", "batch_id": "b1"},
                                       {"person": "lou", "action": "hold", "batch_id": "b1"}], "b1", cfg)
    assert not r["all_approved"]


def test_state_machine_cannot_skip_gates():
    assert state.move_home("accepted", "messaged") == "messaged"
    for bad in [("suggested", "messaged"), ("messaged", "called"), ("answers_in", "verified"), ("verified", "submitted")]:
        with pytest.raises(state.BadMove):
            state.move_home(*bad)
    with pytest.raises(state.BadMove):
        state.move_claim("sourcing", "submitted")


def test_tickets(tmp_path):
    with pytest.raises(PermissionError):
        tickets.issue("nearsite_submit", "1", ["h"], False, {}, 10, tmp_path)
    p = tickets.issue("nearsite_submit", "1", ["h"], True, {}, 10, tmp_path)
    assert tickets.find_valid("nearsite_submit", tmp_path) == p
    assert tickets.find_valid("email_send", tmp_path) is None
    tickets.consume(p)
    assert tickets.find_valid("nearsite_submit", tmp_path) is None
    p2 = tickets.issue("nearsite_submit", "2", ["h"], True, {}, 10, tmp_path)
    p2.write_text(p2.read_text().replace('"2"', '"3"'))  # tampered
    assert tickets.find_valid("nearsite_submit", tmp_path) is None
    tickets.issue("nearsite_submit", "4", ["h"], True, {}, -1, tmp_path)  # expired
    assert tickets.find_valid("nearsite_submit", tmp_path) is None


def test_margin_is_judged_after_nearsite_fees(cfg, claims):
    # $3,700 rent on a $5,700 budget looks fine gross, but nets $1,088 after 16% fees.
    s = scoring.score(claims["90002"], {"home_id": "9900000129", "owner_monthly": 3700, "bedrooms": 3, "pets_ok": True,
                                        "distance_mi": 6, "availability": "Available Now"}, cfg)
    assert any("after fees" in b for b in s.blockers)
    ok = scoring.score(claims["90002"], {"home_id": "9900000112", "owner_monthly": 2500, "bedrooms": 3, "pets_ok": True}, cfg)
    assert not ok.blockers


def test_messages_ask_about_pet_limits_and_never_print_none(cfg, claims):
    c = claims["90002"]
    m = messages.in_app_draft(c, {}, cfg)
    assert "Are 4 dogs OK" in m and "breed limits" in m
    assert "None" not in messages.sona_text_task(c, {}, cfg) and "None" not in messages.sona_call_task(c, {}, cfg)


def test_approvals_reader_needs_both_and_checks_slack_ids(cfg):
    from nearsite_core import approvals as A
    W, L = cfg["approvals"]["people"]["william"]["slack_user"], cfg["approvals"]["people"]["lou"]["slack_user"]
    rows = [{"batch_id": "b", "person": "william", "action": "approve", "slack_user": W, "pressed_at": "1"}]
    assert A.from_rows(rows, "b", cfg) == {"william": "approved", "lou": "waiting"}
    rows.append({"batch_id": "b", "person": "lou", "action": "approve", "slack_user": "UFAKE", "pressed_at": "2"})
    assert A.from_rows(rows, "b", cfg)["lou"] == "waiting"            # wrong Slack id ignored
    rows.append({"batch_id": "b", "person": "lou", "action": "approve", "slack_user": L, "pressed_at": "3"})
    assert A.from_rows(rows, "b", cfg) == {"william": "approved", "lou": "approved"}
    rows.append({"batch_id": "b", "person": "william", "action": "hold", "slack_user": W, "pressed_at": "4"})
    assert A.from_rows(rows, "b", cfg)["william"] == "hold"           # latest press wins
    assert A.from_rows(rows, "other", cfg) == {"william": "waiting", "lou": "waiting"}


# ---------- example pricing and the private overlay ----------
def test_example_pricing_blocks_every_outward_step(cfg, live_cfg, claims, verified_home):
    """The committed config ships example pricing. Until the real overlay is loaded nothing goes out."""
    ex = json.loads(json.dumps(live_cfg))
    ex["pricing"]["_example"] = True
    c = claims["90003"]
    q = pricing.quote(c, verified_home, ex).to_dict()
    ap = {"now": NOW, "approvals": {"william": "approved", "lou": "approved"}}
    assert checker.check_submit(c, verified_home, q, ap, live_cfg).passed
    for v in (checker.check_submit(c, verified_home, q, ap, ex),
              checker.check_outreach(c, verified_home, "Is it free?", {}, ex),
              checker.check_call(c, verified_home, {}, ex)):
        assert not v.passed and checker.PRICING_NOT_LOADED in v.blockers


def test_committed_config_is_example_and_overlay_merges(tmp_path, monkeypatch):
    from nearsite_core import config
    base = config.load(config.CONFIG_PATH)
    assert base["pricing"]["_example"] is True
    assert not any(base["live"].values())
    ov = tmp_path / "overlay.json"
    ov.write_text(json.dumps({"_note": "x", "pricing": {"_example": False, "admin_fee": 1}, "approvals": {"people": {"lou": {"name": "L"}}}}))
    monkeypatch.setenv("NEARSITE_AGENT_CONFIG_LOCAL", str(ov))
    merged = config.load()
    assert merged["pricing"]["_example"] is False and merged["pricing"]["admin_fee"] == 1
    assert merged["pricing"]["clean_fee_min"] == base["pricing"]["clean_fee_min"]  # untouched keys stay
    assert merged["approvals"]["people"]["lou"]["name"] == "L" and merged["approvals"]["people"]["lou"]["slack_user"]
    assert "_note" not in merged or merged["_note"] == base["_note"]
    assert not any(merged["live"].values())


def test_pet_fee_column_is_per_pet_with_the_total(cfg):
    """Regression (found in William's demo): the per-pet column showed the stay's total pet fee."""
    from nearsite_core import templates
    claim = {"company": "Example Co", "pets": "Pet friendly needed (2 dogs)", "pet_details": "2 dogs: Lab 75 lbs, Terrier 15 lbs"}
    assert templates._pet_fee(claim, 550) == "$275 per pet ($550 total for 2)"
    assert templates._pet_fee({**claim, "pets": "Pet friendly needed (1 dog)", "pet_details": "1 dog: Lab 75 lbs"}, 550) == "$550"
    assert templates._pet_fee(claim, 0) == ""


def test_slack_card_counts_read_naturally(cfg):
    from nearsite_core import slack_card
    card = slack_card.build("b1", [{"claim": {"nearsite_claim_id": "1", "company": "X", "city": "A", "state": "TX", "beds": 2,
                                              "move_in": "2026-12-01", "move_out": "2027-01-01"},
                                    "homes": [{"address": "1 A St", "distance_mi": 1, "quote": {"quote_per_day": 100, "markup_monthly": 2000}, "checker_passed": True}]}], cfg)
    assert "1 claim · 1 proposal ·" in card["blocks"][1]["elements"][0]["text"]
