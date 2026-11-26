"""LangGraph runtime: each claim is one durable, event-driven thread.

    START -> intake -> advance -> checker_gate -> dispatch -> wait --(event)--> apply -> advance ...
                                                                \\-> END when the claim is won or lost

- The domain graph (graph.py) decides every move; `advance` walks it with the same pure code the
  file-store loop uses, so there is one definition of the process.
- `wait` is a real pause: interrupt() checkpoints the claim and returns only when an event resumes
  that claim's thread (a map tick or X, a landlord reply, a Sona call result, a Slack approval, or the
  scheduled sweep for time-based moves). People's decisions are pauses, not polling.
- `checker_gate` re-runs the checker on every outward work item at the moment it would go out.
- `dispatch` hands work to the Claude agents through an outbox keyed by an idempotency key, so a
  crash and replay can never send, call or submit twice. Work whose live switch is off is held.
- The checkpointer (SQLite locally, Postgres on Supabase in production) keeps every claim's state
  and full history; `timeline()` and `explain()` read it back.

Each claim's thread is resumed by one caller at a time (`ClaimLocks`; a Postgres advisory lock in
production), so concurrent webhooks can't fork a claim's history.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Callable, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from . import checker, config as CFG, graph as G, harness as H, messages, pricing

LOG_KEEP = 300  # recent events kept in state; the checkpoint history keeps everything
OUTWARD = {"send_outreach", "send_follow_up", "place_call", "submit_claim"}


class ClaimState(TypedDict, total=False):
    claim_id: str
    c: dict            # claim, stage, facts, homes (status, facts, history), history, waiting_on
    work: dict         # work items for this claim
    now: str           # time of the event being handled (ISO)
    log: list          # event records, newest last


# ================================================================ outbox (idempotency)
class Outbox:
    """At-most-once hand-off. `claim(key)` is True only the first time a key is seen."""

    def __init__(self, conn: sqlite3.Connection | None = None, pg=None):
        self.conn, self.pg = conn, pg
        self._lock = threading.Lock()
        if conn is not None:
            conn.execute("create table if not exists agent_outbox (key text primary key, item text not null, at text not null)")
            conn.commit()

    def claim(self, key: str, item: dict) -> bool:
        if self.pg is not None:
            with self.pg.cursor() as cur:
                cur.execute("insert into agent_outbox (key, item) values (%s, %s) on conflict (key) do nothing", (key, json.dumps(item)))
                n = cur.rowcount
            self.pg.commit()
            return n == 1
        with self._lock:
            cur = self.conn.execute("insert or ignore into agent_outbox (key, item, at) values (?, ?, ?)",
                                    (key, json.dumps(item, default=str), datetime.now(timezone.utc).isoformat()))
            self.conn.commit()
            return cur.rowcount == 1

    def all(self) -> list[dict]:
        if self.pg is not None:
            with self.pg.cursor() as cur:
                cur.execute("select key, item from agent_outbox order by key")
                return [{"key": k, **(i if isinstance(i, dict) else json.loads(i))} for k, i in cur.fetchall()]
        with self._lock:
            return [{"key": k, **json.loads(i)} for k, i in self.conn.execute("select key, item from agent_outbox order by key")]


def idempotency_key(item: dict) -> str:
    return hashlib.sha256(f"{item['id']}|{item['kind']}".encode()).hexdigest()[:24]


# ================================================================ per-claim serialisation
class ClaimLocks:
    def __init__(self, pg=None):
        self._locks: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()
        self.pg = pg

    @contextmanager
    def hold(self, claim_id: str):
        with self._guard:
            lk = self._locks.setdefault(claim_id, threading.Lock())
        with lk:
            if self.pg is not None:  # across processes: a session advisory lock per claim
                with self.pg.cursor() as cur:
                    cur.execute("select pg_advisory_lock(hashtext(%s))", (claim_id,))
                try:
                    yield
                finally:
                    with self.pg.cursor() as cur:
                        cur.execute("select pg_advisory_unlock(hashtext(%s))", (claim_id,))
            else:
                yield


# ================================================================ dispatcher
class AgentQueue:
    """Hands queued work to the Claude agents. Default: records it (the agents read their queue).
    A live deployment swaps in a sender that writes agent_work rows or starts an agent session."""

    def __init__(self, send: Callable[[dict], None] | None = None):
        self.sent: list[dict] = []
        self.send = send

    def __call__(self, item: dict) -> None:
        self.sent.append(item)
        if self.send:
            self.send(item)


# ================================================================ build the graph
def build(checkpointer, outbox: Outbox, dispatcher: AgentQueue | None = None, cfg: dict | None = None,
          env: dict | None = None):
    dispatcher = dispatcher or AgentQueue()

    def _cfg():
        return cfg or CFG.load()

    def _now(state) -> datetime:
        return datetime.fromisoformat(state["now"]) if state.get("now") else datetime.now(timezone.utc)

    def intake(state: ClaimState):
        return {"work": state.get("work") or {}, "log": state.get("log") or []}

    def advance(state: ClaimState):
        st = {"claims": {state["claim_id"]: state["c"]}, "work": dict(state["work"])}
        ev = H.advance(st, _cfg(), _now(state), env)
        return {"c": st["claims"][state["claim_id"]], "work": st["work"], "log": (state["log"] + ev)[-LOG_KEEP:]}

    def checker_gate(state: ClaimState):
        """Re-check every outward item now, from the claim's current facts. A fail holds it."""
        c, work, cfg_ = state["c"], dict(state["work"]), _cfg()
        claim = {**c["claim"]}
        out_log = []
        for wid, w in work.items():
            if w["kind"] not in OUTWARD or w["status"] not in ("queued", "held_switch_off"):
                continue
            if w["home_key"]:
                h = c["homes"][w["home_key"]]
                home = {**h["home"], **h["facts"]}
                if w["kind"] in ("send_outreach", "send_follow_up"):
                    msg = messages.in_app_draft(claim, home, cfg_) if w["kind"] == "send_outreach" else messages.follow_up(claim, home, cfg_)
                    v = checker.check_outreach(claim, home, msg, {}, cfg_)
                else:
                    v = checker.check_call(claim, home, {"credits_used_this_month": c["facts"].get("credits_used_this_month", 0)}, cfg_)
            else:
                ready = [{**h["home"], **h["facts"]} for h in c["homes"].values() if h["status"] == "ready"]
                vs = [checker.check_submit(claim, r, pricing.quote(claim, r, cfg_).to_dict(),
                                           {"now": _now(state), "approvals": c["facts"].get("approvals") or {}}, cfg_) for r in ready]
                v = next((x for x in vs if not x.passed), vs[0] if vs else checker.Verdict("submit", False, ["no ready home"]))
            w = dict(w)
            w["checker"] = v.to_dict()
            if not v.passed:
                w["status"] = "blocked_by_checker"
                out_log.append({"kind": "checker_blocked", "claim": state["claim_id"], "work": wid, "why": v.blockers})
            work[wid] = w
        return {"work": work, "log": state["log"] + out_log}

    def dispatch(state: ClaimState):
        work, out_log = dict(state["work"]), []
        for wid, w in work.items():
            if w["status"] != "queued":
                continue
            if w.get("switch") and not CFG.is_live(w["switch"], _cfg(), env):
                w = {**w, "status": "held_switch_off"}   # switch went off since it was queued
            else:
                key = idempotency_key(w)
                if outbox.claim(key, w):
                    dispatcher({**w, "idempotency_key": key})
                    out_log.append({"kind": "dispatched", "claim": state["claim_id"], "work": wid, "agent": w.get("agent")})
                w = {**w, "status": "in_progress", "idempotency_key": key}
            work[wid] = w
        return {"work": work, "log": state["log"] + out_log}

    def after_dispatch(state: ClaimState):
        return END if state["c"]["stage"] in H.TERMINAL_CLAIM else "wait"

    def wait(state: ClaimState):
        c = state["c"]
        payload = {
            "claim": state["claim_id"], "stage": c["stage"], "waiting_on": c.get("waiting_on"),
            "homes": {k: {"status": h["status"], "waiting_on": h.get("waiting_on")} for k, h in c["homes"].items()
                      if h["status"] not in H.TERMINAL_HOME},
            "held": [w["id"] for w in state["work"].values() if w["status"] in ("held_switch_off", "blocked_by_checker")],
        }
        event = interrupt(payload)
        return {"now": event.get("now") or datetime.now(timezone.utc).isoformat(), "log": state["log"] + [{"kind": "resumed", "event": event.get("type")}],
                "c": _apply(state, event)}

    def _apply(state, event):
        st = {"claims": {state["claim_id"]: json.loads(json.dumps(state["c"]))}, "work": {}}
        now = datetime.fromisoformat(event["now"]) if event.get("now") else datetime.now(timezone.utc)
        if event["type"] != "tick":
            H.apply_event(st, {**event, "claim": state["claim_id"]}, now)
        return st["claims"][state["claim_id"]]

    g = StateGraph(ClaimState)
    for name, fn in (("intake", intake), ("advance", advance), ("checker_gate", checker_gate), ("dispatch", dispatch), ("wait", wait)):
        g.add_node(name, fn)
    g.add_edge(START, "intake")
    g.add_edge("intake", "advance")
    g.add_edge("advance", "checker_gate")
    g.add_edge("checker_gate", "dispatch")
    g.add_conditional_edges("dispatch", after_dispatch, ["wait", END])
    g.add_edge("wait", "advance")
    return g.compile(checkpointer=checkpointer)


# ================================================================ driving it
def claim_key(claim_record_or_id) -> str:
    """One id for a claim everywhere: '<source>:<ref>'. A bare id is a Nearsite request."""
    if isinstance(claim_record_or_id, dict):
        r = claim_record_or_id
        if r.get("claim_source") and r.get("claim_ref"):
            return f"{r['claim_source']}:{r['claim_ref']}"
        return f"nearsite:{r.get('nearsite_claim_id') or r.get('claim_ref')}"
    k = str(claim_record_or_id)
    return k if ":" in k else f"nearsite:{k}"


DRAFT_STATUSES = ("accepted", "messaged")


def projection(v: dict, cfg: dict | None = None) -> dict:
    """What the map shows for a claim: stage, what it waits on, and each home's graph status.

    With cfg, a home a person accepted also carries the landlord message the agent drafted, so the map's
    Message landlord button can pre-fill it through the extension (a person still presses Send)."""
    c = v["c"]

    def draft(h):
        if cfg is None or h["status"] not in DRAFT_STATUSES:
            return None
        return messages.in_app_draft(c["claim"], {**h["home"], **h["facts"]}, cfg)

    return {"stage": c["stage"], "label": G.CLAIM_NODES[c["stage"]].label, "waiting_on": c.get("waiting_on"),
            "homes": {k: {"status": h["status"], "label": G.HOME_NODES[h["status"]].label, "waiting_on": h.get("waiting_on"),
                          "draft": draft(h)}
                      for k, h in c["homes"].items()},
            "held": sorted(w["id"] for w in v.get("work", {}).values() if w["status"] in ("held_switch_off", "blocked_by_checker")),
            "graph_version": G.GRAPH_VERSION}


class Runtime:
    def __init__(self, app, locks: ClaimLocks | None = None, project: Callable[[str, dict], None] | None = None,
                 cfg: dict | None = None):
        self.app, self.locks, self.project = app, locks or ClaimLocks(), project
        self._cfg_override = cfg

    @property
    def cfg(self) -> dict:
        return self._cfg_override or CFG.load()

    @staticmethod
    def config(claim_id: str) -> dict:
        return {"configurable": {"thread_id": claim_key(claim_id)}, "recursion_limit": 50}

    def _projected(self, key: str) -> dict:
        st = self.status(key)
        if self.project:
            self.project(key, projection(self.app.get_state(self.config(key)).values, self.cfg))
        return st

    def start(self, claim_record: dict, now: datetime | None = None) -> dict:
        cid = claim_key(claim_record)
        now = now or datetime.now(timezone.utc)
        with self.locks.hold(cid):
            if self.app.get_state(self.config(cid)).values:
                return self.status(cid)  # already running: starting twice is a no-op
            c = {"claim": claim_record, "stage": "new", "facts": {}, "homes": {}, "history": [], "created_at": now.isoformat()}
            self.app.invoke({"claim_id": cid, "c": c, "work": {}, "now": now.isoformat(), "log": []}, self.config(cid))
            return self._projected(cid)

    def send(self, claim_id: str, event: dict) -> dict:
        """Resume one claim with one event. Events for a finished claim are ignored."""
        cid = claim_key(claim_id)
        with self.locks.hold(cid):
            snap = self.app.get_state(self.config(cid))
            if not snap.values:
                raise KeyError(f"unknown claim {cid}")
            if not snap.next:
                return self.status(cid)
            self.app.invoke(Command(resume=event), self.config(cid))
            return self._projected(cid)

    def sweep(self, claim_ids: list[str], now: datetime | None = None) -> dict:
        """Scheduled: lets time-based moves happen (follow-ups, expiry) with no outside event."""
        now = now or datetime.now(timezone.utc)
        return {str(cid): self.send(cid, {"type": "tick", "now": now.isoformat()})["stage"] for cid in claim_ids}

    def status(self, claim_id: str) -> dict:
        claim_id = claim_key(claim_id)
        snap = self.app.get_state(self.config(claim_id))
        v = snap.values
        intr = [i.value for t in (snap.tasks or ()) for i in (t.interrupts or ())]
        return {"claim": claim_id, "stage": v["c"]["stage"], "paused": bool(snap.next), "waiting_for": intr[0] if intr else None,
                "work": {k: w["status"] for k, w in v.get("work", {}).items()}}

    def explain(self, claim_id: str) -> dict:
        v = self.app.get_state(self.config(claim_id)).values
        c = v["c"]
        return {"claim": claim_id, "stage": c["stage"], "waiting_on": c.get("waiting_on"),
                "path": [f"{e['from']} -> {e['to']} ({e['why']})" for e in c.get("history", [])],
                "homes": {k: {"status": h["status"], "waiting_on": h.get("waiting_on"),
                              "path": [f"{e['from']} -> {e['to']} ({e['why']})" for e in h.get("history", [])]}
                          for k, h in c["homes"].items()},
                "graph_version": G.GRAPH_VERSION}

    def timeline(self, claim_id: str) -> list[dict]:
        """Every checkpoint for the claim, oldest first: the graph it can refer back to."""
        out = []
        for s in self.app.get_state_history(self.config(claim_id)):
            v = s.values or {}
            out.append({"checkpoint": s.config["configurable"].get("checkpoint_id"), "next": list(s.next),
                        "stage": (v.get("c") or {}).get("stage"), "at": s.created_at})
        return list(reversed(out))


def local(path: str, cfg: dict | None = None, env: dict | None = None, dispatcher: AgentQueue | None = None) -> tuple[Runtime, Outbox, AgentQueue]:
    """Durable local runtime on one SQLite file (checkpoints + outbox)."""
    from langgraph.checkpoint.sqlite import SqliteSaver
    # The checkpointer and the outbox each get their own connection: SqliteSaver manages its own
    # transactions under its own lock, and sharing its connection let an outbox commit land in the
    # middle of a checkpoint write ("cannot commit - no transaction is active").
    conn = sqlite3.connect(path, check_same_thread=False, timeout=30)
    saver = SqliteSaver(conn)
    saver.setup()
    ob = Outbox(conn=sqlite3.connect(path, check_same_thread=False, timeout=30))
    dq = dispatcher or AgentQueue()
    return Runtime(build(saver, ob, dq, cfg, env), cfg=cfg), ob, dq


def postgres(conn_string: str, cfg: dict | None = None, env: dict | None = None, dispatcher: AgentQueue | None = None):
    """Production runtime on Supabase Postgres. Writes, so it needs supabase_writes to be live."""
    cfg_ = cfg or CFG.load()
    if not CFG.is_live("supabase_writes", cfg_, env):
        raise PermissionError("supabase_writes is off: the runtime can't keep its state in Supabase yet")
    import psycopg
    from psycopg.rows import dict_row
    from langgraph.checkpoint.postgres import PostgresSaver
    # the connection settings PostgresSaver expects (see its docs): autocommit, no prepared
    # statements (Supabase's pooler can't keep them), and rows as dicts
    pg = psycopg.connect(conn_string, autocommit=True, prepare_threshold=0, row_factory=dict_row)
    enc = pg.execute("show server_encoding").fetchone()["server_encoding"]
    if str(enc).upper() not in ("UTF8", "UTF-8"):
        # On a SQL_ASCII database thread ids come back as bytes and resumed checkpoints are
        # written under a different thread, so a claim silently loses its history.
        raise RuntimeError(f"database encoding is {enc}; the runtime needs UTF8 (Supabase uses UTF8)")
    saver = PostgresSaver(pg)
    saver.setup()
    side = psycopg.connect(conn_string)
    with side.cursor() as cur:
        cur.execute("create table if not exists agent_outbox (key text primary key, item jsonb not null, at timestamptz not null default now())")
    side.commit()
    dq = dispatcher or AgentQueue()
    lock_conn = psycopg.connect(conn_string, autocommit=True)
    return Runtime(build(saver, Outbox(pg=side), dq, cfg, env), ClaimLocks(pg=lock_conn), cfg=cfg), Outbox(pg=side), dq
