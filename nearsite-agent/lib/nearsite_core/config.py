"""Loads the agent config and answers one question: may this kind of live action run?

The answer is yes only when all three are true:
  1. live.master is true in config/agent-config.json
  2. the specific switch (for example live.quo_calls) is true
  3. the environment variable NEARSITE_AGENT_LIVE is "1"

Three independent locks mean a single mistaken edit can never send a text,
place a call, post to Slack or submit on Nearsite.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

PLUGIN_ROOT = Path(os.environ.get("CLAUDE_PLUGIN_ROOT") or Path(__file__).resolve().parents[2])
CONFIG_PATH = Path(os.environ.get("NEARSITE_AGENT_CONFIG") or PLUGIN_ROOT / "config" / "agent-config.json")

LIVE_SWITCHES = (
    "quo_texts",
    "quo_calls",
    "nearsite_writes",
    "email_send",
    "slack_posts",
    "monday_writes",
    "supabase_writes",
    "n8n_changes",
)


LOCAL_PATH = PLUGIN_ROOT / "config" / "agent-config.local.json"


def _merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in over.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def overlay_path() -> Path | None:
    """Where the real business values live: env NEARSITE_AGENT_CONFIG_LOCAL, else config/agent-config.local.json.

    The committed config holds example pricing and placeholder people; the overlay (never committed) holds the
    real ones. Without it, pricing._example stays true and the checker refuses every outward step."""
    env = os.environ.get("NEARSITE_AGENT_CONFIG_LOCAL")
    if env:
        return Path(env)
    return LOCAL_PATH if LOCAL_PATH.exists() else None


def load(path: Path | str | None = None) -> dict:
    with open(path or CONFIG_PATH, encoding="utf-8") as f:
        cfg = json.load(f)
    if path is None:
        ov = overlay_path()
        if ov is not None:
            with open(ov, encoding="utf-8") as f:
                cfg = _merge(cfg, {k: v for k, v in json.load(f).items() if k != "_note"})
    return cfg


def pricing_is_example(cfg: dict) -> bool:
    return bool(cfg.get("pricing", {}).get("_example"))


def is_live(switch: str, cfg: dict | None = None, env: dict | None = None) -> bool:
    """True only when master, the named switch and the env lock are all on."""
    if switch not in LIVE_SWITCHES:
        return False
    cfg = cfg if cfg is not None else load()
    env = env if env is not None else os.environ
    live = cfg.get("live", {})
    return bool(live.get("master")) and bool(live.get(switch)) and env.get("NEARSITE_AGENT_LIVE") == "1"


def live_report(cfg: dict | None = None, env: dict | None = None) -> dict:
    cfg = cfg if cfg is not None else load()
    return {s: is_live(s, cfg, env) for s in LIVE_SWITCHES}
