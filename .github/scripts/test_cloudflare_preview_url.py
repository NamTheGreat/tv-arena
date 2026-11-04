import unittest

from cloudflare_preview_url import preview_url_from_check


class PreviewUrlTests(unittest.TestCase):
    def test_reads_branch_preview_url_from_cloudflare_check(self):
        checks = [{
            "name": "Cloudflare Pages",
            "conclusion": "success",
            "output": {"summary": "<strong>Branch Preview URL:</strong></td><td><a href='https://ci-lighthouse-preview-budget.tv-arena.pages.dev'>preview</a>"},
        }]
        self.assertEqual(
            preview_url_from_check(checks),
            "https://ci-lighthouse-preview-budget.tv-arena.pages.dev",
        )

    def test_waits_if_cloudflare_has_not_succeeded(self):
        self.assertIsNone(preview_url_from_check([{
            "name": "Cloudflare Pages",
            "conclusion": None,
            "output": {"summary": ""},
        }]))


if __name__ == "__main__":
    unittest.main()
