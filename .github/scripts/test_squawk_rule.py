import subprocess
import unittest


class SquawkRuleTests(unittest.TestCase):
    def test_view_replacement_with_removed_column_is_flagged(self):
        migration = (
            "CREATE VIEW public.example AS SELECT 1 AS retained, 2 AS removed;\n"
            "CREATE OR REPLACE VIEW public.example AS SELECT 1 AS retained;"
        )
        result = subprocess.run(
            ["npx", "--yes", "squawk-cli@2.70.0", "--include=ban-replace-view-function"],
            input=migration,
            text=True,
            capture_output=True,
            check=False,
        )
        report = result.stdout + result.stderr
        self.assertIn("ban-replace-view-function", report)


if __name__ == "__main__":
    unittest.main()
