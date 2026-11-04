import glob
import json
import os
import urllib.request

MARKER = "<!-- lighthouse-preview-scores -->"


def comment_endpoint(repository, comment_id):
    return f"https://api.github.com/repos/{repository}/issues/comments/{comment_id}"


def report_body():
    rows = []
    for path in sorted(glob.glob(".lighthouseci/lhr-*.json")):
        with open(path, encoding="utf-8") as report_file:
            report = json.load(report_file)
        categories = report.get("categories", {})
        score = lambda key: round(categories.get(key, {}).get("score", 0) * 100)
        rows.append(
            f"| `{report.get('requestedUrl', 'unknown')}` | {score('performance')} | "
            f"{score('accessibility')} | {score('best-practices')} |"
        )
    table = "\n".join(rows) if rows else "| No Lighthouse report was produced | — | — | — |"
    return (
        f"{MARKER}\n### Lighthouse preview scores\n\n"
        "| URL | Performance | Accessibility | Best practices |\n| --- | ---: | ---: | ---: |\n"
        f"{table}\n\nBudgets: 80 / 90 / 90. Initial enforcement is warn-only."
    )


def main():
    repository = os.environ["GITHUB_REPOSITORY"]
    pull_number = os.environ["PR_NUMBER"]
    base = f"https://api.github.com/repos/{repository}/issues/{pull_number}/comments"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
    }
    request = urllib.request.Request(base + "?per_page=100", headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        comments = json.load(response)
    body = report_body()
    existing = next((comment for comment in comments if MARKER in comment.get("body", "")), None)
    if existing:
        url = comment_endpoint(repository, existing["id"])
        method = "PATCH"
    else:
        url = base
        method = "POST"
    request = urllib.request.Request(url, data=json.dumps({"body": body}).encode(), method=method, headers=headers)
    with urllib.request.urlopen(request, timeout=30):
        pass
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
        summary.write(body.replace(MARKER, ""))


if __name__ == "__main__":
    main()
