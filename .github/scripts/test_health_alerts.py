import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent))
from health_alerts import GitHub, is_stale, latest_success, workflow_body


class HealthAlertTests(unittest.TestCase):
    def test_sync_becomes_stale_after_36_hours(self):
        now = datetime(2026, 11, 4, 12, tzinfo=timezone.utc)
        fresh = (now - timedelta(hours=35, minutes=59)).isoformat()
        stale = (now - timedelta(hours=36, seconds=1)).isoformat()
        self.assertFalse(is_stale(fresh, now))
        self.assertTrue(is_stale(stale, now))

    def test_missing_success_is_stale(self):
        self.assertTrue(is_stale(None))

    def test_workflow_failure_body_includes_run_url_and_conclusion(self):
        body = workflow_body("Nightly sync", {
            "html_url": "https://github.com/example/repo/actions/runs/42",
            "conclusion": "failure",
            "updated_at": "2026-11-04T11:00:00Z",
        })
        self.assertIn("https://github.com/example/repo/actions/runs/42", body)
        self.assertIn("`failure`", body)

    def test_alert_is_updated_while_active_and_closed_on_recovery(self):
        class FakeGitHub(GitHub):
            def __init__(self):
                super().__init__("token", "owner/repo")
                self.issues = []

            def request(self, path, method="GET", payload=None):
                if path.startswith("/labels/"):
                    return {"name": "automated-health-alert"}
                if path.startswith("/issues?"):
                    return self.issues
                if path == "/issues" and method == "POST":
                    self.issues.append({"number": len(self.issues) + 1, "title": payload["title"], "body": payload["body"], "state": "open"})
                    return self.issues[-1]
                if path.startswith("/issues/") and method == "PATCH":
                    number = int(path.split("/")[-1])
                    issue = next(item for item in self.issues if item["number"] == number)
                    issue.update(payload)
                    return issue
                raise AssertionError(f"Unexpected GitHub request: {method} {path}")

        github = FakeGitHub()
        github.alert("Alert: sync failed", "first failure", True)
        github.alert("Alert: sync failed", "repeated failure", True)
        self.assertEqual(len(github.issues), 1)
        self.assertEqual(github.issues[0]["body"], "repeated failure")
        github.alert("Alert: sync failed", "recovered", False)
        self.assertEqual(github.issues[0]["state"], "closed")

    @patch("urllib.request.urlopen")
    def test_latest_success_includes_partial_sync_with_updated_shows(self, mock_urlopen):
        recorded_time = "2026-11-16T22:30:00+00:00"
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps([{"completed_at": recorded_time}]).encode()
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        completed = latest_success("https://example.supabase.co", "test-key")
        self.assertEqual(completed, recorded_time)

        # Inspect request URL and params
        req = mock_urlopen.call_args[0][0]
        url = req.full_url
        self.assertIn("status=in.%28success%2Cpartial%29", url)
        self.assertIn("shows_updated=gt.0", url)
        self.assertIn("completed_at=not.is.null", url)

        # Check that partial run with shows_updated > 0 is treated as fresh
        now = datetime(2026, 11, 17, 10, tzinfo=timezone.utc)
        self.assertFalse(is_stale(completed, now))

    @patch("urllib.request.urlopen")
    def test_latest_success_returns_none_when_no_fresh_runs(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps([]).encode()
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        completed = latest_success("https://example.supabase.co", "test-key")
        self.assertIsNone(completed)
        self.assertTrue(is_stale(completed))


if __name__ == "__main__":
    unittest.main()
