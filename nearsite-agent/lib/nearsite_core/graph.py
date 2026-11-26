"""The state graph the harness walks, and refers back to on every tick.

Two graphs, both explicit data:
  CLAIM_GRAPH  new -> sourcing -> outreach -> verifying -> ready -> submitted -> won | lost
  HOME_GRAPH   suggested -> accepted -> messaged -> answers_in -> ok_to_call -> called
               -> verified -> ready -> submitted   (plus declined, dropped, needs_person)

Every edge has a guard: a pure function of (claim, home, facts, cfg, now) that
returns (passed, reason). Edges are tried in order; the first that passes
fires. Some edges need work done first (a message sent, a call placed): those
edges name a `work` type, and the harness queues that work for an agent
instead of moving the home. The move happens when the agent's result comes
back as a fact.

Gate nodes are where the checker or a person decides:
  human     a person picks (tick or X), presses Submit, or approves in Slack
  checker   the submission checker must pass before the edge can fire
  switch    the live switch for that kind of action must be on

The graph itself is versioned and exported (JSON and Mermaid) so a run can
show exactly where each claim and home stands and why.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable

from . import checker, claims as C, pricing

GRAPH_VERSION = "2026-11-26.1"

Guard = Callable[[dict, dict, dict, dict, datetime], "tuple[bool, str]"]


@dataclass(frozen=True)
class Node:
    id: str
    kind: str  # work | human | checker | wait | terminal
    label: str
    agent: str | None = None


@dataclass
class Edge:
    src: str
    dst: str
    guard: Guard
    label: str
    gates: tuple = ()          # names of gate nodes this edge passes through
    work: str | None = None    # work an agent must do before the move
    switch: str | None = None  # live switch the work needs
    done: Guard | None = None  # for work edges: true once the agent's result is in


# ---------------------------------------------------------------- helpers
def _f(facts: dict, key: str, default=None):
    return facts.get(key, default)


def _hours_since(ts: str | None, now: datetime) -> float:
    if not ts:
        return 0.0
    t = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return (now - t).total_seconds() / 3600


def _ok(reason: str) -> tuple[bool, str]:
    return True, reason


def _no(reason: str) -> tuple[bool, str]:
    return False, reason


def submit_ready(claim: dict, home: dict, cfg: dict, now: datetime) -> tuple[bool, list, dict]:
    """Checker verdict on everything except the approvals, which the claim gate handles."""
    q = pricing.quote(claim, home, cfg).to_dict()
    v = checker.check_submit(claim, home, q, {"now": now, "approvals": {p: "approved" for p in cfg["approvals"]["nearsite_required"]},
                                               "management_ok_markup": home.get("management_ok_markup")}, cfg)
    return v.passed, v.blockers, q


# ---------------------------------------------------------------- home guards
def g_picked(decision):
    def g(claim, home, facts, cfg, now):
        d = _f(facts, "pick")
        return (True, f"a person picked {decision}") if d == decision else (False, "waiting for a person to tick or X")
    return g


def g_outreach_ready(claim, home, facts, cfg, now):
    if _f(facts, "opted_out"):
        return _no("landlord opted out")
    msg = _f(facts, "draft_message") or ""
    if not msg:
        from . import messages
        msg = messages.in_app_draft(claim, home, cfg)
    v = checker.check_outreach(claim, home, msg, {"landlord_local_time": _f(facts, "landlord_local_time_obj"),
                                                   "thread_open_for_landlord": _f(facts, "thread_open_for_landlord")}, cfg)
    return (True, "outreach check passed") if v.passed else (False, "; ".join(v.blockers))


def g_outreach_sent(claim, home, facts, cfg, now):
    return (True, "first message sent") if _f(facts, "messages_sent", 0) >= 1 else (False, "message not sent yet")


def g_opted_out(claim, home, facts, cfg, now):
    return (True, "landlord said STOP") if _f(facts, "opted_out") else (False, "")


def g_not_available(claim, home, facts, cfg, now):
    return (True, "landlord says not available") if _f(facts, "available") is False else (False, "")


def g_answers_in(claim, home, facts, cfg, now):
    need = ("available", "landlord_name", "address", "landlord_phone")
    missing = [k for k in need if _f(facts, k) in (None, "")]
    if _f(facts, "available") is not True:
        return _no("waiting for the landlord to confirm the dates")
    return (True, "landlord answered") if not missing else (False, "still missing " + ", ".join(missing))


def g_follow_up_due(claim, home, facts, cfg, now):
    o = cfg["outreach"]
    if _f(facts, "messages_sent", 0) != 1 or _f(facts, "last_reply_at"):
        return _no("")
    h = _hours_since(_f(facts, "last_message_at"), now)
    return (True, f"no reply after {h:.0f} h") if h >= o["follow_up_after_hours"] else (False, "")


def g_no_reply_after_follow_up(claim, home, facts, cfg, now):
    if _f(facts, "messages_sent", 0) > cfg["outreach"]["max_follow_ups"] and not _f(facts, "last_reply_at"):
        if _hours_since(_f(facts, "last_message_at"), now) >= 48:
            return _ok("no reply 48 h after the follow-up")
    return _no("")


def g_unparsed(claim, home, facts, cfg, now):
    n = len(facts.get("unparsed_messages") or [])
    return (True, f"{n} new message(s) from the landlord") if n else (False, "")


def g_consent(claim, home, facts, cfg, now):
    return (True, "landlord said yes to a call in writing") if _f(facts, "call_consent") is True else (False, "no written yes to a call yet")


def g_no_consent(claim, home, facts, cfg, now):
    return (True, "landlord declined a call; a person takes it from here") if _f(facts, "call_consent") is False else (False, "")


def g_call_ready(claim, home, facts, cfg, now):
    v = checker.check_call(claim, {**home, **facts}, {"credits_used_this_month": _f(facts, "credits_used_this_month", 0),
                                                       "landlord_local_time": _f(facts, "landlord_local_time_obj")}, cfg)
    return (True, "call check passed") if v.passed else (False, "; ".join(v.blockers))


def g_called(claim, home, facts, cfg, now):
    return (True, "call finished") if _f(facts, "call_done") else (False, "call not done yet")


def g_call_attempts_spent(claim, home, facts, cfg, now):
    if not _f(facts, "call_done") and _f(facts, "call_attempts", 0) >= cfg["calls"]["max_attempts"]:
        return _ok("2 calls tried without an answer")
    return _no("")


def g_verified(claim, home, facts, cfg, now):
    return (True, "landlord confirmed the details") if _f(facts, "verified") is True else (False, "details not confirmed on the call")


def g_terms_break_fit(claim, home, facts, cfg, now):
    if C.has_pets(claim) and _f(facts, "pets_ok") is False:
        return _ok("landlord won't take the pets")
    if "no_stairs" in C.needs(claim) and _f(facts, "single_level") is False:
        return _ok("home has stairs")
    return _no("")


def g_submit_check(claim, home, facts, cfg, now):
    ok, blockers, _ = submit_ready(claim, {**home, **facts}, cfg, now)
    return (True, "checker passed") if ok else (False, "; ".join(blockers))


def g_claim_submitted(claim, home, facts, cfg, now):
    return (True, "submitted with the claim") if home.get("home_key") in (claim.get("_facts", {}).get("submitted_homes") or []) else (False, "")


def g_expired(claim, home, facts, cfg, now):
    exp = claim.get("expires_at")
    if exp and datetime.fromisoformat(str(exp).replace("Z", "+00:00")) <= now:
        return _ok("the request expired")
    return _no("")


def g_resume(target):
    def g(claim, home, facts, cfg, now):
        ok = facts.get("person_action") == "resume" and facts.get("resume_to") == target
        return (True, f"a person sent it back to {target}") if ok else (False, "waiting for a person")
    return g


# ---------------------------------------------------------------- home graph
HOME_NODES = {n.id: n for n in [
    Node("suggested", "human", "Suggested: waiting for a tick or X", "home-sourcing"),
    Node("accepted", "work", "Accepted: outreach queued", "landlord-outreach"),
    Node("declined", "terminal", "Declined by a person"),
    Node("messaged", "wait", "Messaged: waiting for the landlord", "landlord-outreach"),
    Node("answers_in", "wait", "Answers in: waiting for a yes to a call", "landlord-outreach"),
    Node("ok_to_call", "work", "OK to call: call queued", "verification-call"),
    Node("called", "checker", "Called: answers being checked", "submission-checker"),
    Node("verified", "checker", "Verified: final check", "submission-checker"),
    Node("ready", "human", "Ready: waiting for Submit and approvals"),
    Node("submitted", "terminal", "Submitted"),
    Node("dropped", "terminal", "Dropped"),
    Node("needs_person", "human", "Needs a person"),
]}

HOME_EDGES = [
    # A landlord's STOP ends contact at every step, not only while we wait for a reply (found in review of PR #29).
    *[Edge(src, "dropped", g_opted_out, "landlord said STOP")
      for src in ("accepted", "ok_to_call", "called", "verified", "ready", "needs_person")],
    Edge("suggested", "accepted", g_picked("accept"), "person ticks", gates=("human_pick",)),
    Edge("suggested", "declined", g_picked("decline"), "person Xs", gates=("human_pick",)),
    Edge("accepted", "dropped", g_expired, "request expired"),
    Edge("accepted", "messaged", g_outreach_ready, "first message", gates=("checker_outreach", "switch_quo_texts"),
         work="send_outreach", switch="quo_texts", done=g_outreach_sent),
    Edge("messaged", "dropped", g_opted_out, "landlord said STOP"),
    Edge("messaged", "dropped", g_not_available, "not available"),
    Edge("messaged", "answers_in", g_answers_in, "landlord answered"),
    Edge("messaged", "messaged", g_unparsed, "read the reply", work="parse_reply",
         done=lambda c, h, f, cfg, now: (not f.get("unparsed_messages"), "reply read")),
    Edge("messaged", "messaged", g_follow_up_due, "one follow-up", gates=("checker_outreach", "switch_quo_texts"),
         work="send_follow_up", switch="quo_texts",
         done=lambda c, h, f, cfg, now: (f.get("messages_sent", 0) >= 2, "follow-up sent")),
    Edge("messaged", "dropped", g_no_reply_after_follow_up, "no reply"),
    Edge("answers_in", "dropped", g_opted_out, "landlord said STOP"),
    Edge("answers_in", "ok_to_call", g_consent, "written yes to a call"),
    Edge("answers_in", "answers_in", g_unparsed, "read the reply", work="parse_reply",
         done=lambda c, h, f, cfg, now: (not f.get("unparsed_messages"), "reply read")),
    Edge("answers_in", "needs_person", g_no_consent, "no call allowed"),
    Edge("ok_to_call", "dropped", g_expired, "request expired"),
    Edge("ok_to_call", "needs_person", g_call_attempts_spent, "calls unanswered"),
    Edge("ok_to_call", "called", g_call_ready, "verification call", gates=("checker_call", "switch_quo_calls"),
         work="place_call", switch="quo_calls", done=g_called),
    Edge("called", "dropped", g_terms_break_fit, "terms don't fit"),
    Edge("called", "verified", g_verified, "details confirmed"),
    Edge("called", "needs_person", lambda c, h, f, cfg, now: _ok("call left gaps") if f.get("call_done") and f.get("verified") is False else _no(""),
         "call left gaps"),
    Edge("verified", "ready", g_submit_check, "checker passes", gates=("checker_submit",)),
    Edge("verified", "needs_person", lambda c, h, f, cfg, now: (lambda r: (True, r[1]) if not r[0] and f.get("checked_once") else (False, ""))(g_submit_check(c, h, f, cfg, now)),
         "checker blocked"),
    Edge("ready", "submitted", g_claim_submitted, "submitted"),
    Edge("needs_person", "dropped", lambda c, h, f, cfg, now: (True, "a person dropped it") if f.get("person_action") == "drop" else (False, ""), "person drops it",
         gates=("human_resolve",)),
    Edge("needs_person", "messaged", g_resume("messaged"), "person resumes", gates=("human_resolve",)),
    Edge("needs_person", "ok_to_call", g_resume("ok_to_call"), "person resumes", gates=("human_resolve",)),
    Edge("needs_person", "called", g_resume("called"), "person resumes", gates=("human_resolve",)),
    Edge("needs_person", "verified", g_resume("verified"), "person resumes", gates=("human_resolve",)),
    Edge("ready", "verified", lambda c, h, f, cfg, now: (lambda r: (True, "checker no longer passes: " + r[1]) if not r[0] else (False, ""))(g_submit_check(c, h, f, cfg, now)),
         "re-check failed"),
]


# ---------------------------------------------------------------- claim graph
def _homes_in(claim, statuses) -> list:
    return [h for h in claim.get("_homes", []) if h.get("status") in statuses]


def gc_sourced(claim, _h, facts, cfg, now):
    return (True, "homes scored") if claim.get("_homes") else (False, "no homes scored yet")


def gc_any_accepted(claim, _h, facts, cfg, now):
    n = len(_homes_in(claim, {"accepted", "messaged", "answers_in", "ok_to_call", "called", "verified", "ready"}))
    return (True, f"{n} homes picked") if n else (False, "waiting for a person to tick homes")


def gc_any_calling(claim, _h, facts, cfg, now):
    n = len(_homes_in(claim, {"ok_to_call", "called", "verified", "ready"}))
    return (True, f"{n} landlords agreed to a call") if n else (False, "waiting for landlords")


def gc_any_ready(claim, _h, facts, cfg, now):
    n = len(_homes_in(claim, {"ready"}))
    return (True, f"{n} homes passed the checker") if n else (False, "no home has passed the checker yet")


def gc_submit(claim, _h, facts, cfg, now):
    """Guard for queuing the submit: Submit pressed and (Nearsite) both approvals in."""
    if not facts.get("submit_pressed"):
        return _no("waiting for a person to press Submit")
    if claim.get("source", "nearsite") == "nearsite":
        ap = facts.get("approvals") or {}
        missing = [cfg["approvals"]["people"][p]["name"] for p in cfg["approvals"]["nearsite_required"] if ap.get(p) != "approved"]
        if missing:
            return _no("waiting for approval from " + " and ".join(missing))
    return _ok("Submit pressed and approvals in")


LIVE_HOME = {"suggested", "accepted", "messaged", "answers_in", "ok_to_call", "called", "verified", "ready", "needs_person"}


def gc_need_more_homes(claim, _h, facts, cfg, now):
    homes = claim.get("_homes", [])
    if facts.get("search_exhausted"):
        return _no("")
    if homes and not any(h.get("status") in LIVE_HOME for h in homes):
        return _ok("every home was declined or dropped; looking for more")
    return _no("")


def gc_fell_back(statuses, label):
    def g(claim, _h, facts, cfg, now):
        if facts.get("submitted_homes"):
            return _no("")
        if not _homes_in(claim, statuses):
            return _ok(label)
        return _no("")
    return g


def gc_dead(claim, _h, facts, cfg, now):
    ok, why = g_expired(claim, {}, facts, cfg, now)
    if ok and not facts.get("submitted_homes"):
        return True, why
    homes = claim.get("_homes", [])
    if homes and all(h.get("status") in ("declined", "dropped") for h in homes) and facts.get("search_exhausted"):
        return _ok("every home dropped and no more to find")
    return _no("")


def gc_outcome(result):
    def g(claim, _h, facts, cfg, now):
        return (True, f"adjuster picked {'us' if result == 'won' else 'another option'}") if facts.get("outcome") == result else (False, "")
    return g


CLAIM_NODES = {n.id: n for n in [
    Node("new", "work", "New claim", "claim-intake"),
    Node("sourcing", "human", "Sourcing: homes scored, waiting for ticks", "home-sourcing"),
    Node("outreach", "wait", "Outreach: talking to landlords", "landlord-outreach"),
    Node("verifying", "work", "Verifying: calls and checks", "verification-call"),
    Node("ready", "human", "Ready: Submit and approvals", "approval-and-reporting"),
    Node("submitted", "wait", "Submitted: waiting for the adjuster"),
    Node("won", "terminal", "Won"),
    Node("lost", "terminal", "Lost or expired"),
]}

CLAIM_EDGES = [
    Edge("new", "sourcing", gc_sourced, "homes scored"),
    Edge("new", "new", lambda c, h, f, cfg, now: (not c.get("_homes"), "no homes scored yet"), "score homes", work="source_homes",
         done=gc_sourced),
    Edge("sourcing", "lost", gc_dead, "expired or nothing fits"),
    Edge("sourcing", "outreach", gc_any_accepted, "homes picked", gates=("human_pick",)),
    Edge("sourcing", "sourcing", gc_need_more_homes, "find more homes", work="source_homes",
         done=lambda c, h, f, cfg, now: (any(x.get("status") in LIVE_HOME for x in c.get("_homes", [])), "new homes in")),
    Edge("outreach", "lost", gc_dead, "expired or nothing fits"),
    Edge("outreach", "verifying", gc_any_calling, "landlord agreed to a call"),
    Edge("outreach", "sourcing", gc_fell_back({"accepted", "messaged", "answers_in", "ok_to_call", "called", "verified", "ready", "needs_person"},
                                              "no picked home is still in play"), "back to sourcing"),
    Edge("verifying", "lost", gc_dead, "expired or nothing fits"),
    Edge("verifying", "ready", gc_any_ready, "a home passed the checker", gates=("checker_submit",)),
    Edge("verifying", "outreach", gc_fell_back({"ok_to_call", "called", "verified", "ready", "needs_person"},
                                               "no home is being verified any more"), "back to outreach"),
    Edge("ready", "lost", gc_dead, "expired"),
    Edge("ready", "verifying", gc_fell_back({"ready"}, "no home is ready any more"), "back to verifying"),
    Edge("ready", "submitted", gc_submit, "submit", gates=("human_submit", "approvals_both", "switch_nearsite_writes", "ticket"),
         work="submit_claim", switch="nearsite_writes",
         done=lambda c, h, f, cfg, now: (bool(f.get("submitted_homes")), "submit done")),
    Edge("submitted", "won", gc_outcome("won"), "won"),
    Edge("submitted", "lost", gc_outcome("lost"), "lost"),
]

GATES = {
    "human_pick": "A person ticks or Xs each home in the map",
    "human_submit": "A person presses Submit on the claim",
    "approvals_both": "William and Lou both press Approve in Slack (Nearsite claims)",
    "checker_outreach": "Checker passes the landlord message",
    "checker_call": "Checker passes the call (written consent, credits, hours)",
    "checker_submit": "Checker passes the home for submission",
    "ticket": "A one-time gate ticket exists for the submit",
    "switch_quo_texts": "Live switch quo_texts is on",
    "switch_quo_calls": "Live switch quo_calls is on",
    "switch_nearsite_writes": "Live switch nearsite_writes is on",
    "human_resolve": "A person decides what happens to a home the agent couldn't finish",
}


def edges_from(graph: str, node: str) -> list[Edge]:
    return [e for e in (HOME_EDGES if graph == "home" else CLAIM_EDGES) if e.src == node]


def export() -> dict:
    def ed(e: Edge):
        return {"from": e.src, "to": e.dst, "label": e.label, "gates": list(e.gates), "work": e.work, "switch": e.switch}
    return {
        "version": GRAPH_VERSION,
        "claim": {"nodes": [vars(n) for n in CLAIM_NODES.values()], "edges": [ed(e) for e in CLAIM_EDGES]},
        "home": {"nodes": [vars(n) for n in HOME_NODES.values()], "edges": [ed(e) for e in HOME_EDGES]},
        "gates": GATES,
    }


def to_mermaid(which: str = "home") -> str:
    edges = HOME_EDGES if which == "home" else CLAIM_EDGES
    nodes = HOME_NODES if which == "home" else CLAIM_NODES
    shape = {"human": ('{{', '}}'), "checker": ('{', '}'), "terminal": ('([', '])'), "work": ('[', ']'), "wait": ('(', ')')}
    lines = ["flowchart LR"]
    for n in nodes.values():
        a, b = shape[n.kind]
        lines.append(f'  {n.id}{a}"{n.label}"{b}')
    seen = set()
    for e in edges:
        key = (e.src, e.dst, e.label)
        if key in seen or e.src == e.dst:
            continue
        seen.add(key)
        lab = e.label + (" · " + ", ".join(e.gates) if e.gates else "")
        lines.append(f'  {e.src} -->|"{lab}"| {e.dst}')
    return "\n".join(lines)


def validate() -> list[str]:
    """Structural checks: every edge points at known nodes, terminals have no exits,
    every non-terminal node can reach a terminal, and every outward work edge is gated."""
    problems = []
    for name, nodes, edges in (("home", HOME_NODES, HOME_EDGES), ("claim", CLAIM_NODES, CLAIM_EDGES)):
        for e in edges:
            if e.src not in nodes or e.dst not in nodes:
                problems.append(f"{name}: edge {e.src}->{e.dst} names an unknown node")
            if nodes.get(e.src) and nodes[e.src].kind == "terminal":
                problems.append(f"{name}: terminal {e.src} has an exit")
            if e.switch and not any(g.startswith("switch_") for g in e.gates):
                problems.append(f"{name}: work edge {e.src}->{e.dst} has a switch but no switch gate")
            if e.work and e.done is None:
                problems.append(f"{name}: work edge {e.src}->{e.dst} has no done check")
            for g in e.gates:
                if g not in GATES:
                    problems.append(f"{name}: edge {e.src}->{e.dst} names unknown gate {g}")
        terminals = {n for n, v in nodes.items() if v.kind == "terminal"}
        adj: dict[str, set] = {}
        for e in edges:
            adj.setdefault(e.src, set()).add(e.dst)
        for n in nodes:
            if n in terminals:
                continue
            stack, seen = [n], set()
            while stack:
                x = stack.pop()
                if x in seen:
                    continue
                seen.add(x)
                stack.extend(adj.get(x, ()))
            if not (seen & terminals):
                problems.append(f"{name}: {n} can never finish")
    return problems
