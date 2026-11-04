#!/usr/bin/env python3
"""Create, refresh, and recover GitHub issue alerts for scheduled data jobs."""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

LABEL = "automated-health-alert"
STALE_TITLE = "Alert: TV Arena data sync is stale"
WORKFLOWS = {
    "TV Arena Nightly Rust Sync": "nightly-sync.yml",
    "TV Arena Weekly TMDb Events Ingestion": "weekly-events.yml",
    "TV Arena Seed Catalog (TMDb Auto-Discover)": "seed-catalog.yml",
}


def parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def is_stale(latest_success, now=None):
    if not latest_success:
        return True
    now = now or datetime.now(timezone.utc)
    return (now - parse_time(latest_success)).total_seconds() > 36 * 60 * 60


class GitHub:
    def __init__(self, token, repository):
        self.base = f"https://api.github.com/repos/{repository}"
        self.token = token

    def request(self, path, method="GET", payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(
            self.base + path,
            data=data,
            method=method,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {self.token}",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None

    def alert(self, title, body, active):
        labels_path = "/labels/" + urllib.parse.quote(LABEL, safe="")
        try:
            self.request(labels_path)
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
            try:
                self.request("/labels", "POST", {"name": LABEL, "color": "d73a4a", "description": "Automated workflow health alert"})
            except urllib.error.HTTPError as create_error:
                if create_error.code != 422:
                    raise

        query = urllib.parse.urlencode({"state": "all", "labels": LABEL, "per_page": 100})
        issues = self.request(f"/issues?{query}")
        issue = next((item for item in issues if "pull_request" not in item and item["title"] == title), None)
        if active:
            if issue is None or issue["state"] == "closed":
                self.request("/issues", "POST", {"title": title, "body": body, "labels": [LABEL]})
            else:
                self.request(f"/issues/{issue['number']}", "PATCH", {"body": body, "state": "open"})
        elif issue is not None and issue["state"] == "open":
            self.request(f"/issues/{issue['number']}", "PATCH", {"body": body, "state": "closed"})


def latest_success(url, key):
    query = urllib.parse.urlencode({"select": "completed_at", "status": "eq.success", "completed_at": "not.is.null", "order": "completed_at.desc", "limit": "1"})
    request = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/sync_runs?{query}",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        rows = json.loads(response.read())
    return rows[0]["completed_at"] if rows else None


def workflow_body(name, run):
    return (
        f"The **{name}** workflow failed.\n\n"
        f"- Run: {run.get('html_url', 'unknown')}\n"
        f"- Conclusion: `{run.get('conclusion', 'unknown')}`\n"
        f"- Completed: {run.get('updated_at', 'unknown')}\n\n"
        "This issue is refreshed when another failure occurs and closed after a successful run."
    )


def main():
    gh = GitHub(os.environ["GITHUB_TOKEN"], os.environ["GITHUB_REPOSITORY"])
    if os.environ.get("GH_EVENT_NAME") == "workflow_run":
        with open(os.environ["GH_EVENT_PATH"], encoding="utf-8") as event_file:
            run = json.load(event_file)["workflow_run"]
        name = run.get("name", "")
        if name not in WORKFLOWS:
            return
        title = f"Alert: {name} workflow failed"
        failed = run.get("conclusion") != "success"
        gh.alert(title, workflow_body(name, run), failed)

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to evaluate sync freshness")
    completed_at = latest_success(url, key)
    stale = is_stale(completed_at)
    if completed_at:
        age_hours = (datetime.now(timezone.utc) - parse_time(completed_at)).total_seconds() / 3600
        detail = f"Latest successful sync completed at `{completed_at}` ({age_hours:.1f} hours ago)."
    else:
        detail = "No successful sync run is recorded."
    gh.alert(
        STALE_TITLE,
        f"The latest successful nightly sync is more than 36 hours old.\n\n{detail}\n\nThis issue is refreshed every six hours and closed when a successful sync is less than 36 hours old.",
        stale,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"::error::{error}", file=sys.stderr)
        raise
