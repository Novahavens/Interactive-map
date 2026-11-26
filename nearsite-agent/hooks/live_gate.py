#!/usr/bin/env python3
"""Live gate: a PreToolUse hook that blocks every outward action until it is switched on.

An action passes only when all three locks are open:
  1. config live.master is true
  2. the action's own switch in config live.* is true
  3. the environment variable NEARSITE_AGENT_LIVE is "1" in the Claude Code process
Final submits (Nearsite submit, Nearsite add-property save, adjuster email send)
also need a valid, unused gate ticket (lib/nearsite_core/tickets.py), which is
consumed when the call is allowed.

Some things are blocked whatever the switches say:
  - the agent changing its own config, this hook, or the tickets folder
  - the agent writing approvals rows (only the Slack button handler may)
  - pressing Send in a listing site's in-app messenger (a person presses Send)

Every decision is appended to ~/.nearsite-agent/audit.jsonl.
Reads (list, get, search, SELECT) always pass.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PLUGIN_ROOT") or Path(__file__).resolve().parents[1])
sys.path.insert(0, str(ROOT / "lib"))

from nearsite_core import config as CFG  # noqa: E402
from nearsite_core import tickets as T  # noqa: E402

AUDIT = Path(os.environ.get("NEARSITE_AGENT_AUDIT") or Path.home() / ".nearsite-agent" / "audit.jsonl")

READ_VERBS = re.compile(r"(^|[_\-.])(get|list|search|read|query|fetch|find|describe|explore|count|aggregate|validate|whoami|lookup)([_\-.]|$)", re.I)
PROTECTED_PATHS = re.compile(r"agent-config\.json|live_gate\.py|hooks\.json|\.nearsite-agent[/\\]tickets", re.I)
WRITE_SHELL = re.compile(r"(>|\btee\b|\bsed\s+-i|\bmv\b|\bcp\b|\brm\b|\bchmod\b|\btruncate\b|open\([^)]*['\"][wa]|write_text|json\.dump|\bperl\s+-p?i)", re.I)
SQL_WRITE = re.compile(r"\b(insert|update|delete|upsert|merge|alter|drop|create|truncate|grant|revoke|comment\s+on|call|do)\b", re.I)
SUBMIT_TEXT = re.compile(r"\b(submit|send proposal|create proposal)\b", re.I)
ADD_PROP_TEXT = re.compile(r"\b(add property|save property|create property|publish property|list property)\b", re.I)
SEND_TEXT = re.compile(r"\b(send|send message|reply|contact host|message host)\b", re.I)
SAVE_TEXT = re.compile(r"\b(save|publish|confirm|approve|accept|pay|book|delete|remove|cancel)\b", re.I)

HOSTS = [
    (re.compile(r"openphone\.com|quo\.com|api\.quo\.", re.I), "quo_texts"),
    (re.compile(r"slack\.com/api|hooks\.slack\.com", re.I), "slack_posts"),
    (re.compile(r"api\.monday\.com", re.I), "monday_writes"),
    (re.compile(r"supabase\.co", re.I), "supabase_writes"),
    (re.compile(r"n8n\.|/api/v1/workflows|/webhook/", re.I), "n8n_changes"),
    (re.compile(r"nearsite\.com", re.I), "nearsite_writes"),
    (re.compile(r"gmail\.googleapis\.com|smtp\.|sendgrid|resend\.com|mailgun", re.I), "email_send"),
]
NET_CLIENT = re.compile(r"\b(curl|wget|http|httpie|requests\.|httpx|urllib|fetch\(|aiohttp|nc\b)", re.I)
NET_WRITE = re.compile(r"(-X\s*(POST|PUT|PATCH|DELETE)|--data|-d\s|--form|-F\s|\.post\(|\.put\(|\.patch\(|\.delete\(|method=['\"]?(POST|PUT|PATCH|DELETE))", re.I)


def _flat(obj) -> str:
    if isinstance(obj, dict):
        return " ".join(_flat(v) for v in obj.values())
    if isinstance(obj, list):
        return " ".join(_flat(v) for v in obj)
    return str(obj)


def classify(tool: str, inp: dict) -> dict:
    """Returns {kind: allow|gate|block, switch?, ticket?, reason}."""
    t = tool or ""
    low = t.lower()
    text = _flat(inp)

    # 1. Self-protection: config, hook, tickets.
    if t in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
        path = str(inp.get("file_path") or inp.get("notebook_path") or "")
        if PROTECTED_PATHS.search(path):
            return {"kind": "block", "reason": "the agent may not change its own live switches, gate hook or tickets"}
        return {"kind": "allow", "reason": "local file edit"}
    if t == "Bash":
        cmd = str(inp.get("command") or "")
        if PROTECTED_PATHS.search(cmd) and WRITE_SHELL.search(cmd):
            return {"kind": "block", "reason": "the agent may not change its own live switches, gate hook or tickets"}
        if re.search(r"NEARSITE_AGENT_LIVE\s*=", cmd) and not re.search(r"echo\s+\$?NEARSITE_AGENT_LIVE", cmd):
            return {"kind": "block", "reason": "the live environment switch is set by a person when starting Claude Code, not by the agent"}
        if NET_CLIENT.search(cmd):
            for rx, sw in HOSTS:
                if rx.search(cmd) and (NET_WRITE.search(cmd) or sw in ("slack_posts", "quo_texts", "email_send")):
                    return {"kind": "gate", "switch": sw, "reason": f"network write to a protected service ({sw})"}
        return {"kind": "allow", "reason": "shell command with no protected write"}

    if not low.startswith("mcp__"):
        return {"kind": "allow", "reason": "not an outward tool"}
    _, server, name = (low.split("__", 2) + ["", ""])[:3]

    # 2. Quo / OpenPhone
    if "quo" in server or "openphone" in server:
        if re.search(r"start[-_]agent[-_]call|make[-_]call|call", name) and not READ_VERBS.search(name):
            return {"kind": "gate", "switch": "quo_calls", "reason": "Quo / Sona call"}
        if READ_VERBS.search(name) and not re.search(r"send|start|create|update|delete|cancel", name):
            return {"kind": "allow", "reason": "Quo read"}
        return {"kind": "gate", "switch": "quo_texts", "reason": "Quo text or Sona conversation"}

    # 3. Slack
    if "slack" in server:
        if re.search(r"send|schedule|post|update|reply|create|add_reaction|invite", name):
            return {"kind": "gate", "switch": "slack_posts", "reason": "Slack post"}
        return {"kind": "allow", "reason": "Slack read"}

    # 4. Email (Gmail, Resend, Outlook)
    if any(s in server for s in ("gmail", "resend", "outlook", "mail")):
        if re.search(r"(^|_|-)(send|reply|forward)", name):
            return {"kind": "gate", "switch": "email_send", "ticket": "email_send", "reason": "email send"}
        if re.search(r"draft|label|trash|spam|delete|update|create", name):
            return {"kind": "gate", "switch": "email_send", "reason": "mailbox change"}
        return {"kind": "allow", "reason": "mail read"}

    # 5. Monday
    if "monday" in server:
        if READ_VERBS.search(name) or name in ("all_api_read", "board_insights", "workspace_info"):
            return {"kind": "allow", "reason": "Monday read"}
        if name == "all_monday_api" and re.match(r"\s*(query\b|\{)", str(inp.get("query") or "")) and "mutation" not in text.lower():
            return {"kind": "allow", "reason": "Monday GraphQL query"}
        return {"kind": "gate", "switch": "monday_writes", "reason": "Monday write"}

    # 6. Supabase
    if "supabase" in server:
        if name in ("execute_sql",):
            sql = str(inp.get("query") or "")
            body = re.sub(r"--.*?$|/\*.*?\*/", " ", sql, flags=re.S | re.M)
            if re.search(r"submission_approvals|agent_approvals", body, re.I) and SQL_WRITE.search(body):
                return {"kind": "block", "reason": "approvals are written only by the Slack button handler"}
            if SQL_WRITE.search(body):
                return {"kind": "gate", "switch": "supabase_writes", "reason": "Supabase write SQL"}
            return {"kind": "allow", "reason": "Supabase read SQL"}
        if READ_VERBS.search(name) or name in ("search_docs", "generate_typescript_types"):
            return {"kind": "allow", "reason": "Supabase read"}
        return {"kind": "gate", "switch": "supabase_writes", "reason": "Supabase change"}

    # 7. n8n
    if "n8n" in server:
        if READ_VERBS.search(name) and not re.search(r"publish|update|create|archive|execute|test|delete|install|mutate", name):
            return {"kind": "allow", "reason": "n8n read"}
        return {"kind": "gate", "switch": "n8n_changes", "reason": "n8n change"}

    # 8. Browsers (cloud browser, Claude in Chrome, browser-use)
    if any(s in server for s in ("browser", "chrome")):
        if inp.get("submit") is True:
            return {"kind": "gate", "switch": "nearsite_writes", "reason": "typing with submit presses Enter"}
        if re.search(r"click|press|drag|hold|handle_dialog|computer|form_input|javascript|exec|file_upload", name):
            if re.search(r"press_key", name) and re.search(r"\benter\b", text, re.I):
                return {"kind": "gate", "switch": "nearsite_writes", "reason": "Enter key can submit a form"}
            if SUBMIT_TEXT.search(text):
                return {"kind": "gate", "switch": "nearsite_writes", "ticket": "nearsite_submit", "reason": "Nearsite proposal submit"}
            if ADD_PROP_TEXT.search(text):
                return {"kind": "gate", "switch": "nearsite_writes", "ticket": "nearsite_add_property", "reason": "Nearsite add property"}
            if SEND_TEXT.search(text) and not re.search(r"nearsite", text, re.I):
                return {"kind": "block", "reason": "a person presses Send in a listing site's messenger, never the agent"}
            if SAVE_TEXT.search(text) or re.search(r"javascript|exec|computer", name):
                return {"kind": "gate", "switch": "nearsite_writes", "reason": "browser action that may save or send"}
        return {"kind": "allow", "reason": "browser read or navigation"}

    # 9. Anything else that writes to an outside service
    if READ_VERBS.search(name):
        return {"kind": "allow", "reason": "read"}
    return {"kind": "allow", "reason": "tool outside the agent's protected services"}


def decide(tool: str, inp: dict, env=None, cfg=None, state_dir=None) -> dict:
    env = os.environ if env is None else env
    c = classify(tool, inp)
    if c["kind"] == "allow":
        return {"decision": "allow", **c}
    if c["kind"] == "block":
        return {"decision": "deny", **c}
    cfg = cfg or CFG.load()
    sw = c["switch"]
    if not CFG.is_live(sw, cfg, env):
        live = cfg.get("live", {})
        why = []
        if not live.get("master"):
            why.append("live.master is off")
        if not live.get(sw):
            why.append(f"live.{sw} is off")
        if env.get("NEARSITE_AGENT_LIVE") != "1":
            why.append("NEARSITE_AGENT_LIVE is not 1")
        return {"decision": "deny", **c, "reason": f"{c['reason']}: blocked because {', '.join(why)}"}
    if c.get("ticket"):
        p = T.find_valid(c["ticket"], state_dir)
        if not p:
            return {"decision": "deny", **c, "reason": f"{c['reason']}: no valid gate ticket (checker pass + approvals)"}
        T.consume(p)
        return {"decision": "allow", **c, "ticket_used": p.name}
    return {"decision": "allow", **c}


def _audit(rec: dict) -> None:
    try:
        AUDIT.parent.mkdir(parents=True, exist_ok=True)
        with AUDIT.open("a") as f:
            f.write(json.dumps(rec) + "\n")
    except Exception:
        pass


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        data = {}
    tool, inp = data.get("tool_name", ""), data.get("tool_input") or {}
    try:
        d = decide(tool, inp)
    except Exception as e:  # fail closed
        d = {"decision": "deny", "reason": f"live gate error, failing closed: {e}"}
    _audit({"t": time.time(), "tool": tool, **{k: d.get(k) for k in ("decision", "switch", "ticket", "reason", "ticket_used")}})
    if d["decision"] == "deny":
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                                  "permissionDecisionReason": f"Nearsite live gate: {d['reason']}"}}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
