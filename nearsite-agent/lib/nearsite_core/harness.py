"""The agentic harness: a loop that walks the state graph and remembers where it is.

Each tick:
  1. load every claim and home from the store (so a crash or restart resumes where it left off)
  2. for each claim and home, try the graph edges out of its current node, in order
  3. an edge whose guard passes either moves the thing (and records why) or, if it needs
     work, queues one work item for an agent (never twice; held if its live switch is off)
  4. save state, events and the work queue

Agents pick up work items, do them with their own tools behind the live gate, and report
back with `ingest(event)`. The next tick sees the new facts and moves on. Nothing here
sends, posts or calls anything.

Stores:
  LocalStore     JSON files in a folder (dry runs, tests)
  SupabaseStore  agent_state / agent_events / agent_work tables (migration 002); writes
                 only when the supabase_writes switch is live
"""
from __future__ import annotations

import contextlib
import fcntl
import json
import os
import time as _time
from datetime import datetime, time, timezone
from pathlib import Path
from typing import Callable

from . import config as CFG
from . import graph as G

MAX_MOVES_PER_TICK = 8
TERMINAL_HOME = {n for n, v in G.HOME_NODES.items() if v.kind == "terminal"}
TERMINAL_CLAIM = {n for n, v in G.CLAIM_NODES.items() if v.kind == "terminal"}


def _iso(now: datetime) -> str:
    return now.astimezone(timezone.utc).isoformat()


# ================================================================ stores
class LocalStore:
    def __init__(self, folder: str | Path):
        self.dir = Path(folder)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.state_path = self.dir / "state.json"
        self.events_path = self.dir / "events.jsonl"

    @contextlib.contextmanager
    def lock(self):
        """One writer at a time: a tick and agents reporting results must not overwrite each other."""
        with open(self.dir / ".lock", "w") as fh:
            fcntl.flock(fh, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(fh, fcntl.LOCK_UN)

    def load(self) -> dict:
        if self.state_path.exists():
            return json.loads(self.state_path.read_text())
        return {"graph_version": G.GRAPH_VERSION, "claims": {}, "work": {}, "ticks": 0}

    def save(self, state: dict) -> None:
        tmp = self.state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=1, default=str))
        tmp.replace(self.state_path)  # atomic: a crash never leaves half a state

    def append_events(self, events: list[dict]) -> None:
        with self.events_path.open("a") as f:
            for e in events:
                f.write(json.dumps(e, default=str) + "\n")

    def events(self) -> list[dict]:
        if not self.events_path.exists():
            return []
        return [json.loads(l) for l in self.events_path.read_text().splitlines() if l.strip()]


class SupabaseStore:
    """Same interface, backed by Supabase REST. `http(method, path, body)` is injected so it
    can be tested without a network; writes refuse unless supabase_writes is live."""

    def __init__(self, http: Callable[[str, str, object], object], cfg: dict, env: dict | None = None):
        self.http, self.cfg, self.env = http, cfg, env

    def lock(self):
        # The LangGraph runtime (runtime.py) serialises each claim with a Postgres advisory lock.
        return contextlib.nullcontext()

    def _writable(self):
        if not CFG.is_live("supabase_writes", self.cfg, self.env):
            raise PermissionError("supabase_writes is off: the harness state is not saved to Supabase")

    def load(self) -> dict:
        rows = self.http("GET", "/rest/v1/agent_state?select=claim_id,state", None) or []
        work = self.http("GET", "/rest/v1/agent_work?select=id,item&status=in.(queued,held_switch_off,in_progress)", None) or []
        meta = self.http("GET", "/rest/v1/agent_state?claim_id=eq.__meta__&select=state", None) or []
        st = {"graph_version": G.GRAPH_VERSION, "claims": {}, "work": {}, "ticks": 0}
        for r in rows:
            if r["claim_id"] != "__meta__":
                st["claims"][r["claim_id"]] = r["state"]
        for w in work:
            st["work"][w["id"]] = w["item"]
        if meta:
            st["ticks"] = meta[0]["state"].get("ticks", 0)
        return st

    def save(self, state: dict) -> None:
        self._writable()
        rows = [{"claim_id": cid, "stage": c["stage"], "state": c, "graph_version": state["graph_version"]} for cid, c in state["claims"].items()]
        rows.append({"claim_id": "__meta__", "stage": "meta", "state": {"ticks": state["ticks"]}, "graph_version": state["graph_version"]})
        self.http("POST", "/rest/v1/agent_state?on_conflict=claim_id", rows)
        wk = [{"id": k, "status": v["status"], "kind": v["kind"], "claim_id": v["claim_id"], "item": v} for k, v in state["work"].items()]
        if wk:
            self.http("POST", "/rest/v1/agent_work?on_conflict=id", wk)

    def append_events(self, events: list[dict]) -> None:
        self._writable()
        if events:
            self.http("POST", "/rest/v1/agent_events", [{"claim_id": e.get("claim"), "home_key": e.get("home"), "kind": e["kind"], "event": e} for e in events])


# ================================================================ state helpers
def _claim_view(c: dict) -> dict:
    """What guards see: the claim fields, its facts, and its homes with their status."""
    homes = [{**h["home"], **h["facts"], "home_key": k, "status": h["status"]} for k, h in c["homes"].items()]
    return {**c["claim"], "_facts": c["facts"], "_homes": homes}


def _home_facts(h: dict) -> dict:
    f = dict(h["facts"])
    lt = f.get("landlord_local_time")
    if isinstance(lt, str):
        f["landlord_local_time_obj"] = time.fromisoformat(lt)
    return f


def _record(c_or_h: dict, frm: str, to: str, label: str, reason: str, now: datetime) -> dict:
    entry = {"at": _iso(now), "from": frm, "to": to, "edge": label, "why": reason}
    c_or_h.setdefault("history", []).append(entry)
    return entry


WORK_WORDS = {"parse_reply": "reading the landlord's reply", "source_homes": "finding homes", "send_outreach": "the first message to the landlord",
              "send_follow_up": "the follow-up to the landlord", "place_call": "the verification call", "submit_claim": "the Nearsite submission"}
SWITCH_WORDS = {"send_outreach": "texts", "send_follow_up": "texts", "place_call": "calls", "submit_claim": "Nearsite saves"}


def _work_wait(kind: str, status: str) -> str:
    """What a person reads on the map while work waits (no internal names)."""
    what = WORK_WORDS.get(kind, kind.replace("_", " "))
    if status == "held_switch_off":
        return f"{what}: ready, held because {SWITCH_WORDS.get(kind, 'this step')} are switched off"
    if status == "blocked_by_checker":
        return f"{what}: stopped by the checker"
    return f"{what} ({status.replace('_', ' ')})"


WORK_AGENT = {"parse_reply": "outreach-agent", "source_homes": "sourcing-agent", "send_outreach": "outreach-agent", "send_follow_up": "outreach-agent",
              "place_call": "verification-agent", "submit_claim": "nearsite-agent"}


def _work_id(claim_id: str, home_key: str | None, kind: str, seq: int) -> str:
    return f"{claim_id}:{home_key or '-'}:{kind}:{seq}"


def _queue(state: dict, claim_id: str, home_key: str | None, edge: G.Edge, reason: str, seq: int, cfg: dict, env, now, events):
    wid = _work_id(claim_id, home_key, edge.work, seq)
    live = (edge.switch is None) or CFG.is_live(edge.switch, cfg, env)
    want = "queued" if live else "held_switch_off"
    item = state["work"].get(wid)
    if item and (item["status"] in ("in_progress", "done") or item["status"] == want):
        return item  # running or finished work is never re-queued; same status needs no change
    # new work, or the switch changed since it was queued: (re)set its status
    item = {"id": wid, "kind": edge.work, "claim_id": claim_id, "home_key": home_key, "status": want,
            "switch": edge.switch, "why": reason, "created_at": item["created_at"] if item else _iso(now),
            "agent": WORK_AGENT.get(edge.work)}
    if edge.work == "submit_claim" and state["claims"][claim_id]["claim"].get("source", "nearsite") != "nearsite":
        item["agent"] = "email-submission-agent"
    state["work"][wid] = item
    events.append({"at": _iso(now), "kind": "work_" + want, "claim": claim_id, "home": home_key, "work": wid, "why": reason})
    return item


# ================================================================ tick
def tick(store, cfg: dict | None = None, now: datetime | None = None, env: dict | None = None) -> dict:
    with store.lock():
        return _tick(store, cfg, now, env)


def _tick(store, cfg, now, env) -> dict:
    cfg = cfg or CFG.load()
    now = now or datetime.now(timezone.utc)
    env = os.environ if env is None else env
    state = store.load()
    state["ticks"] = state.get("ticks", 0) + 1
    events = advance(state, cfg, now, env)
    state["graph_version"] = G.GRAPH_VERSION
    state["last_tick_at"] = _iso(now)
    store.save(state)
    store.append_events(events)
    return {"tick": state["ticks"], "events": events, "summary": summary(state)}



def _walk(kind: str, node_of: Callable[[], str], set_node: Callable[[str], None], rec_target: dict, view_fn, home: dict,
          facts_fn, cid: str, hk: str | None, state: dict, cfg: dict, now: datetime, env, events: list, terminal: set,
          seq_fn: Callable[[G.Edge, dict], int]) -> None:
    """Moves one claim or home along the graph as far as the guards allow this tick."""
    moves = 0
    while node_of() not in terminal and moves < MAX_MOVES_PER_TICK:
        view, facts = view_fn(), facts_fn()
        fired, waiting = None, None
        for e in G.edges_from(kind, node_of()):
            if e.work:
                done, _ = e.done(view, home, facts, cfg, now)
                if done and e.src != e.dst:
                    fired = (e, f"{e.work} done")
                    break
                ok, why = e.guard(view, home, facts, cfg, now)
                if ok and not done:
                    item = _queue(state, cid, hk, e, why, seq_fn(e, facts), cfg, env, now, events)
                    waiting = waiting or _work_wait(e.work, item["status"])
                    if e.src == e.dst:
                        continue
                    break
                if not ok and why and waiting is None:
                    waiting = why
                continue
            ok, why = e.guard(view, home, facts, cfg, now)
            if ok:
                fired = (e, why)
                break
            if why and waiting is None:
                waiting = why
        if fired:
            e, why = fired
            frm = node_of()
            set_node(e.dst)
            if kind == "home" and e.dst == "verified":
                rec_target["facts"]["checked_once"] = False
            ent = _record(rec_target, frm, e.dst, e.label, why, now)
            events.append({"kind": f"{kind}_moved", "claim": cid, "home": hk, **ent})
            rec_target["waiting_on"] = None
            moves += 1
            continue
        if kind == "home" and node_of() == "verified":
            rec_target["facts"]["checked_once"] = True  # a check still failing next tick goes to a person
        if kind == "home" and node_of() == "needs_person":
            # Say why it needs a person (the reason it got here), not what the exits are waiting for.
            hist = rec_target.get("history") or []
            waiting = f"a person: {hist[-1]['why']}" if hist and hist[-1].get("to") == "needs_person" else "a person to look at it"
        rec_target["waiting_on"] = waiting
        break


def advance(state: dict, cfg: dict, now: datetime, env) -> list[dict]:
    """Walks every claim and home in `state` ({"claims": {...}, "work": {...}}) as far as the graph
    allows right now. No I/O: it only changes `state`. The file-store loop and the LangGraph runtime
    both call it, so both follow exactly the same graph."""
    events: list[dict] = []
    for cid, c in state["claims"].items():
        for hk, h in c["homes"].items():   # homes first, so the claim sees this tick's home moves
            _walk("home", lambda h=h: h["status"], lambda v, h=h: h.__setitem__("status", v), h,
                  lambda c=c: _claim_view(c), {**h["home"], "home_key": hk}, lambda h=h: _home_facts(h),
                  cid, hk, state, cfg, now, env, events, TERMINAL_HOME,
                  lambda e, f: f.get("messages_sent", 0) if e.work.startswith("send")
                  else len(f.get("parse_log", [])) + len(f.get("unparsed_messages", [])) if e.work == "parse_reply"
                  else f.get("call_attempts", 0))
        _walk("claim", lambda c=c: c["stage"], lambda v, c=c: c.__setitem__("stage", v), c,
              lambda c=c: _claim_view(c), {}, lambda c=c: c["facts"],
              cid, None, state, cfg, now, env, events, TERMINAL_CLAIM,
              lambda e, f: f.get("sourcing_rounds", 0) if e.work == "source_homes" else f.get("submit_attempts", 0))

    # mark work done once the thing it was for has moved on
    for w in state["work"].values():
        if w["status"] not in ("queued", "held_switch_off", "in_progress"):
            continue
        c = state["claims"].get(w["claim_id"])
        if not c:
            continue
        seq = int(w["id"].rsplit(":", 1)[1])
        if w["home_key"]:
            h = c["homes"].get(w["home_key"], {})
            f = h.get("facts", {})
            finished = (w["kind"] == "parse_reply" and not f.get("unparsed_messages")) or \
                       (w["kind"] == "send_outreach" and f.get("messages_sent", 0) >= 1) or \
                       (w["kind"] == "send_follow_up" and f.get("messages_sent", 0) >= 2) or \
                       (w["kind"] == "place_call" and (f.get("call_done") or f.get("call_attempts", 0) > seq)) or \
                       h.get("status") in TERMINAL_HOME
        else:
            finished = (w["kind"] == "source_homes" and c["facts"].get("sourcing_rounds", 0) > seq) or \
                       (w["kind"] == "submit_claim" and bool(c["facts"].get("submitted_homes"))) or c["stage"] in TERMINAL_CLAIM
        if finished:
            w["status"] = "done"
            w["done_at"] = _iso(now)
    return events


# ================================================================ ingest
FACT_KEYS = {
    "landlord_reply": ("available", "landlord_name", "address", "landlord_phone", "call_consent", "opted_out", "landlord_email"),
    "call_result": None,  # every answer field is kept
}


HOME_EVENTS = {"human_pick", "outreach_sent", "landlord_reply", "landlord_message", "call_attempt", "call_result", "person_action"}


def ingest(store, event: dict, now: datetime | None = None) -> dict:
    """Record a fact from a person, an agent or a webhook, then save. The next tick acts on it."""
    with store.lock():
        return _ingest(store, event, now)


def _ingest(store, event: dict, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    state = store.load()
    rec = apply_event(state, event, now)
    store.save(state)
    store.append_events([rec])
    return rec


def apply_event(state: dict, event: dict, now: datetime) -> dict:
    """Applies one fact to `state` ({"claims": {...}}). No I/O. Returns the event record."""
    k, cid = event["type"], str(event.get("claim"))
    if k == "claim_new":
        cl = event["claim_record"]
        cid = str(cl.get("nearsite_claim_id") or cl.get("claim_ref"))
        if cid not in state["claims"]:
            state["claims"][cid] = {"claim": cl, "stage": "new", "facts": {}, "homes": {}, "history": [], "created_at": _iso(now)}
    c = state["claims"].get(cid)
    if c is None:
        raise KeyError(f"unknown claim {cid}")
    hk = str(event.get("home")) if event.get("home") is not None else None
    h = c["homes"].get(hk) if hk else None
    if hk and h is None:
        raise KeyError(f"unknown home {hk} on claim {cid}")
    if k in HOME_EVENTS and h is None:
        raise KeyError(f"{k} needs a home")

    if k == "homes_scored":
        for s in event["homes"]:
            key = str(s.get("home_key") or s.get("home_id"))
            if key not in c["homes"]:
                c["homes"][key] = {"home": s, "status": "suggested", "facts": {}, "history": []}
        c["facts"]["search_exhausted"] = bool(event.get("search_exhausted"))
        c["facts"]["sourcing_rounds"] = c["facts"].get("sourcing_rounds", 0) + 1
    elif k == "human_pick":
        h["facts"]["pick"] = event["decision"]
        h["facts"]["picked_by"] = event.get("by")
    elif k == "outreach_sent":
        h["facts"]["messages_sent"] = h["facts"].get("messages_sent", 0) + 1
        h["facts"]["last_message_at"] = event.get("at") or _iso(now)
        h["facts"]["channel"] = event.get("channel")
    elif k == "landlord_message":
        # raw text from Quo; the outreach agent reads it and reports a landlord_reply
        h["facts"].setdefault("unparsed_messages", []).append({"at": event.get("at") or _iso(now), "text": str(event.get("text", ""))[:4000]})
        h["facts"]["last_reply_at"] = event.get("at") or _iso(now)
        if event.get("stop") or str(event.get("text", "")).strip().lower() in ("stop", "stop all", "unsubscribe", "cancel", "end", "quit"):
            h["facts"]["opted_out"] = True   # STOP is honoured at once, without waiting for an agent
    elif k == "landlord_reply":
        for key in FACT_KEYS["landlord_reply"]:
            if key in event:
                h["facts"][key] = event[key]
        h["facts"]["last_reply_at"] = event.get("at") or _iso(now)
        h["facts"]["unparsed_messages"] = []
    elif k == "call_attempt":
        h["facts"]["call_attempts"] = h["facts"].get("call_attempts", 0) + 1
    elif k == "call_result":
        h["facts"]["call_attempts"] = h["facts"].get("call_attempts", 0) + 1
        h["facts"]["call_done"] = True
        h["facts"].update(dict(event.get("answers", {})))
        h["facts"]["verified"] = bool(event.get("verified"))
    elif k == "person_action":
        h["facts"]["person_action"] = event["action"]
        h["facts"]["resume_to"] = event.get("resume_to")
    elif k == "submit_pressed":
        c["facts"]["submit_pressed"] = True
        c["facts"]["submit_pressed_by"] = event.get("by")
    elif k == "approvals":
        c["facts"]["approvals"] = event["approvals"]
        c["facts"]["batch_id"] = event.get("batch_id")
    elif k == "submitted":
        c["facts"]["submitted_homes"] = [str(x) for x in event["homes"]]
    elif k == "outcome":
        c["facts"]["outcome"] = event["result"]
    elif k in ("claim_new", "tick"):
        pass
    else:
        raise ValueError(f"unknown event type {k}")
    return {"at": _iso(now), "kind": "ingest_" + k, "claim": cid, "home": hk,
            "data": {kk: vv for kk, vv in event.items() if kk not in ("type", "claim", "home", "claim_record", "now")}}


# ================================================================ reading it back
def summary(state: dict) -> dict:
    out = {"claims": {}, "work": {}}
    for cid, c in state["claims"].items():
        counts: dict[str, int] = {}
        for h in c["homes"].values():
            counts[h["status"]] = counts.get(h["status"], 0) + 1
        out["claims"][cid] = {"stage": c["stage"], "waiting_on": c.get("waiting_on"), "homes": counts}
    for w in state["work"].values():
        out["work"][w["status"]] = out["work"].get(w["status"], 0) + 1
    return out


def explain(store, claim_id: str) -> dict:
    """Where a claim and each home stand on the graph, how they got there, and what they wait on."""
    state = store.load()
    c = state["claims"][str(claim_id)]
    homes = {}
    for hk, h in c["homes"].items():
        homes[hk] = {"status": h["status"], "label": G.HOME_NODES[h["status"]].label, "waiting_on": h.get("waiting_on"),
                     "path": [f"{e['from']} -> {e['to']} ({e['why']})" for e in h.get("history", [])]}
    work = [w for w in state["work"].values() if w["claim_id"] == str(claim_id) and w["status"] != "done"]
    return {"claim": claim_id, "stage": c["stage"], "label": G.CLAIM_NODES[c["stage"]].label, "waiting_on": c.get("waiting_on"),
            "path": [f"{e['from']} -> {e['to']} ({e['why']})" for e in c.get("history", [])],
            "homes": homes, "open_work": work, "graph_version": state.get("graph_version")}


def run_loop(store, ticks: int, interval_s: float = 0, cfg: dict | None = None, env: dict | None = None,
             on_tick: Callable[[dict], None] | None = None, now_fn: Callable[[], datetime] | None = None) -> list[dict]:
    """Ticks until nothing changes for two ticks in a row or `ticks` runs out."""
    results, quiet = [], 0
    for _ in range(ticks):
        r = tick(store, cfg, now_fn() if now_fn else None, env)
        results.append(r)
        if on_tick:
            on_tick(r)
        quiet = quiet + 1 if not r["events"] else 0
        if quiet >= 2:
            break
        if interval_s:
            _time.sleep(interval_s)
    return results
