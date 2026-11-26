import json
import subprocess
import sys
from pathlib import Path

import pytest

import live_gate as G
from nearsite_core import tickets

ROOT = Path(__file__).resolve().parents[1]
ON = {"NEARSITE_AGENT_LIVE": "1"}

OUTWARD = [
    ("mcp__quo__send-message", {"to": "+1", "content": "x"}, "quo_texts"),
    ("mcp__quo__send-bulk-messages", {"to": ["+1", "+2"]}, "quo_texts"),
    ("mcp__quo__start-agent-conversation", {"to": "+1"}, "quo_texts"),
    ("mcp__quo__start-agent-call", {"to": "+1"}, "quo_calls"),
    ("mcp__openphone__send_message", {}, "quo_texts"),
    ("mcp__slack__slack_send_message", {}, "slack_posts"),
    ("mcp__Slack__slack_schedule_message", {}, "slack_posts"),
    ("mcp__Gmail__send_message", {}, "email_send"),
    ("mcp__Gmail__reply", {}, "email_send"),
    ("mcp__Gmail__create_draft", {}, "email_send"),
    ("mcp__monday_com__create_item", {}, "monday_writes"),
    ("mcp__monday_com__change_item_column_values", {}, "monday_writes"),
    ("mcp__monday_com__all_monday_api", {"query": "mutation { create_item(board_id:1) { id } }"}, "monday_writes"),
    ("mcp__Supabase__execute_sql", {"query": "update nearsite_claims set status='x'"}, "supabase_writes"),
    ("mcp__Supabase__apply_migration", {"query": "create table x()"}, "supabase_writes"),
    ("mcp__n8n__publish_workflow", {}, "n8n_changes"),
    ("mcp__n8n__update_workflow", {}, "n8n_changes"),
    ("mcp__n8n__execute_workflow", {}, "n8n_changes"),
    ("mcp__remote-browser__browser_click", {"target": "e4 Save"}, "nearsite_writes"),
    ("mcp__remote-browser__browser_press_key", {"key": "Enter"}, "nearsite_writes"),
    ("mcp__remote-browser__browser_type", {"target": "e5 Search", "text": "x", "submit": True}, "nearsite_writes"),
    ("mcp__claude-in-chrome__computer", {"action": "left_click", "coordinate": [10, 10]}, "nearsite_writes"),
    ("mcp__Quo__start-agent-call", {"to": "+1"}, "quo_calls"),
    ("mcp__claude-in-chrome__javascript_tool", {"text": "document.forms[0].submit()"}, "nearsite_writes"),
    ("Bash", {"command": "curl -X POST https://slack.com/api/chat.postMessage -d text=hi"}, "slack_posts"),
    ("Bash", {"command": "curl https://api.openphone.com/v1/messages -d '{}'"}, "quo_texts"),
    ("Bash", {"command": "python3 -c \"import requests; requests.post('https://x.supabase.co/rest/v1/t', json={})\""}, "supabase_writes"),
]

READS = [
    ("mcp__quo__list-messages", {}),
    ("mcp__Slack__slack_read_channel", {}),
    ("mcp__Gmail__search_threads", {}),
    ("mcp__monday_com__get_board_info", {}),
    ("mcp__monday_com__all_monday_api", {"query": "query { boards(ids:1){ name } }"}),
    ("mcp__Supabase__execute_sql", {"query": "select * from nearsite_claims -- update later"}),
    ("mcp__n8n__search_workflows", {}),
    ("mcp__remote-browser__browser_snapshot", {}),
    ("mcp__remote-browser__browser_navigate", {"url": "https://www.nearsite.com"}),
    ("mcp__remote-browser__browser_type", {"target": "e5 Base rent", "text": "176.59"}),
    ("Bash", {"command": "python3 scripts/dry_run.py --out /tmp/x"}),
    ("Bash", {"command": "cat config/agent-config.json"}),
    ("Read", {"file_path": "x"}),
]


@pytest.mark.parametrize("tool,inp,switch", OUTWARD)
def test_outward_denied_while_off(tool, inp, switch, cfg, tmp_path):
    d = G.decide(tool, inp, env=ON, cfg=cfg, state_dir=tmp_path)
    assert d["decision"] == "deny" and d["switch"] == switch


@pytest.mark.parametrize("tool,inp,switch", OUTWARD)
def test_outward_needs_env_lock_too(tool, inp, switch, live_cfg, tmp_path):
    assert G.decide(tool, inp, env={}, cfg=live_cfg, state_dir=tmp_path)["decision"] == "deny"


@pytest.mark.parametrize("tool,inp", READS)
def test_reads_pass(tool, inp, cfg, tmp_path):
    assert G.decide(tool, inp, env={}, cfg=cfg, state_dir=tmp_path)["decision"] == "allow"


@pytest.mark.parametrize("tool,inp", [
    ("Edit", {"file_path": "/x/nearsite-agent-skills/config/agent-config.json"}),
    ("Write", {"file_path": "/x/hooks/live_gate.py"}),
    ("Bash", {"command": "sed -i 's/false/true/' config/agent-config.json"}),
    ("Bash", {"command": "echo '{}' > ~/.nearsite-agent/tickets/nearsite_submit-1-1.json"}),
    ("Bash", {"command": "NEARSITE_AGENT_LIVE=1 claude"}),
    ("mcp__Supabase__execute_sql", {"query": "insert into submission_approvals values (1)"}),
    ("mcp__Supabase__execute_sql", {"query": "insert into agent_approvals (batch_id) values (1)"}),
    ("mcp__remote-browser__browser_click", {"target": "e9 Send message to host"}),
])
def test_always_blocked_even_when_live(tool, inp, live_cfg, tmp_path):
    assert G.decide(tool, inp, env=ON, cfg=live_cfg, state_dir=tmp_path)["decision"] == "deny"


def test_live_switch_opens_only_its_own_action(cfg, tmp_path):
    c = json.loads(json.dumps(cfg))
    c["live"]["master"] = True
    c["live"]["slack_posts"] = True
    assert G.decide("mcp__slack__slack_send_message", {}, env=ON, cfg=c, state_dir=tmp_path)["decision"] == "allow"
    assert G.decide("mcp__quo__send-message", {}, env=ON, cfg=c, state_dir=tmp_path)["decision"] == "deny"


def test_submit_needs_one_ticket_per_click(live_cfg, tmp_path):
    click = ("mcp__remote-browser__browser_click", {"target": "e88 Submit proposal"})
    assert G.decide(*click, env=ON, cfg=live_cfg, state_dir=tmp_path)["decision"] == "deny"
    tickets.issue("nearsite_submit", "90003", ["h"], True, {}, 120, tmp_path)
    assert G.decide(*click, env=ON, cfg=live_cfg, state_dir=tmp_path)["decision"] == "allow"
    assert G.decide(*click, env=ON, cfg=live_cfg, state_dir=tmp_path)["decision"] == "deny"
    # a submit ticket does not open an email send
    tickets.issue("nearsite_submit", "90003", ["h"], True, {}, 120, tmp_path)
    assert G.decide("mcp__Gmail__send_message", {}, env=ON, cfg=live_cfg, state_dir=tmp_path)["decision"] == "deny"


def test_hook_script_end_to_end_denies(tmp_path):
    env = {"PATH": "/usr/bin:/bin", "NEARSITE_AGENT_AUDIT": str(tmp_path / "a.jsonl"), "HOME": str(tmp_path)}
    r = subprocess.run([sys.executable, str(ROOT / "hooks" / "live_gate.py")], input=json.dumps(
        {"tool_name": "mcp__quo__start-agent-call", "tool_input": {"to": "+1"}}), capture_output=True, text=True, env=env)
    out = json.loads(r.stdout)
    assert out["hookSpecificOutput"]["permissionDecision"] == "deny"
    assert (tmp_path / "a.jsonl").exists()
    r = subprocess.run([sys.executable, str(ROOT / "hooks" / "live_gate.py")], input=json.dumps(
        {"tool_name": "mcp__Slack__slack_read_channel", "tool_input": {}}), capture_output=True, text=True, env=env)
    assert r.stdout.strip() == ""


def test_hook_fails_closed_on_bad_config(tmp_path):
    env = {"PATH": "/usr/bin:/bin", "NEARSITE_AGENT_CONFIG": str(tmp_path / "missing.json"),
           "NEARSITE_AGENT_AUDIT": str(tmp_path / "a.jsonl"), "HOME": str(tmp_path)}
    r = subprocess.run([sys.executable, str(ROOT / "hooks" / "live_gate.py")], input=json.dumps(
        {"tool_name": "mcp__slack__slack_send_message", "tool_input": {}}), capture_output=True, text=True, env=env)
    assert json.loads(r.stdout)["hookSpecificOutput"]["permissionDecision"] == "deny"


def test_hooks_json_points_at_gate():
    h = json.loads((ROOT / "hooks" / "hooks.json").read_text())
    m = h["hooks"]["PreToolUse"][0]
    assert "mcp__" in m["matcher"] and "Bash" in m["matcher"] and "Edit" in m["matcher"]
    assert "live_gate.py" in m["hooks"][0]["command"]
