import json
import os
import re
import time
import urllib.request


def preview_url_from_check(check_runs):
    for check in check_runs:
        if check.get("name") != "Cloudflare Pages" or check.get("conclusion") != "success":
            continue
        summary = check.get("output", {}).get("summary", "") or ""
        match = re.search(
            r"Branch Preview URL:</strong>\s*</td>\s*<td>\s*<a href='(https://[^']+)'",
            summary,
            re.IGNORECASE,
        )
        if match:
            return match.group(1)
    return None


def fetch_check_runs(repository, sha, token):
    url = f"https://api.github.com/repos/{repository}/commits/{sha}/check-runs?per_page=100"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response).get("check_runs", [])


def main():
    repository = os.environ["GITHUB_REPOSITORY"]
    sha = os.environ["PR_HEAD_SHA"]
    token = os.environ["GITHUB_TOKEN"]
    for _ in range(40):
        preview_url = preview_url_from_check(fetch_check_runs(repository, sha, token))
        if preview_url:
            with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as env_file:
                env_file.write(f"PREVIEW_URL={preview_url}\n")
            print(f"Cloudflare Pages preview is ready: {preview_url}")
            return
        print("Waiting for Cloudflare Pages preview deployment check...")
        time.sleep(15)
    raise RuntimeError("No successful Cloudflare Pages check exposed a branch preview URL after 10 minutes")


if __name__ == "__main__":
    main()
