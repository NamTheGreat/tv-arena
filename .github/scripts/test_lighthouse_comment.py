import unittest

from comment_lighthouse import comment_endpoint


class LighthouseCommentTests(unittest.TestCase):
    def test_comment_update_uses_repository_comment_endpoint(self):
        self.assertEqual(
            comment_endpoint("NamTheGreat/tv-arena", 42),
            "https://api.github.com/repos/NamTheGreat/tv-arena/issues/comments/42",
        )


if __name__ == "__main__":
    unittest.main()
