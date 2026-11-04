import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from health_alerts import is_stale, workflow_body


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


if __name__ == "__main__":
    unittest.main()
