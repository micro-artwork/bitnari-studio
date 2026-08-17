"""
gemini_review.py
Fetches the PR diff via GitHub API, sends it to Gemini for code review,
and posts the result as a PR comment.

Required environment variables:
  GEMINI_API_KEY  – Gemini API key (stored in GitHub Secrets)
  GITHUB_TOKEN    – Automatically provided by GitHub Actions
  PR_NUMBER       – Pull request number (set by workflow)
  REPO_FULL_NAME  – e.g. "micro-artwork/bitnari-studio" (set by workflow)
  BASE_SHA        – Base commit SHA
  HEAD_SHA        – Head commit SHA
"""

import os
import sys
import json
import urllib.request
import urllib.error

# ── Environment ──────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GITHUB_TOKEN   = os.environ.get("GITHUB_TOKEN", "").strip()
PR_NUMBER      = os.environ.get("PR_NUMBER", "")
REPO           = os.environ.get("REPO_FULL_NAME", "")   # owner/repo
BASE_SHA       = os.environ.get("BASE_SHA", "")
HEAD_SHA       = os.environ.get("HEAD_SHA", "")

# ── Early validation ─────────────────────────────────────────────────────────
if not GEMINI_API_KEY:
    print(
        "ERROR: GEMINI_API_KEY is not set or empty.\n"
        "  1. Get a key at https://aistudio.google.com/apikey\n"
        "  2. Add it as a GitHub Secret: Settings → Secrets → Actions → GEMINI_API_KEY",
        file=sys.stderr,
    )
    sys.exit(1)

if not GITHUB_TOKEN:
    print("ERROR: GITHUB_TOKEN is not available.", file=sys.stderr)
    sys.exit(1)

# Model selection: Defaults to "gemini-2.5-flash" (generous free-tier quota & fast analysis)
# Available models: "gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash", etc.
GEMINI_MODEL   = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip()
MAX_DIFF_CHARS = 100_000  # Truncate very large diffs to stay within token limits

# Files to skip reviewing (generated, lock files, binary assets, etc.)
SKIP_EXTENSIONS = {
    ".lock", ".min.js", ".min.css",
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
    ".bin", ".hex", ".elf",
}
SKIP_PATHS = {
    "node_modules/", "build/", "dist/", ".svelte-kit/",
    "package-lock.json", "src/lib/windrpc/WindRpcClient.js"
}


# ── GitHub API helpers ───────────────────────────────────────────────────────
def gh_request(method: str, path: str, body=None) -> dict | str:
    url = f"https://api.github.com/repos/{REPO}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
        method=method,
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def get_pr_diff() -> str:
    """Fetch the raw unified diff for the PR."""
    url = f"https://api.github.com/repos/{REPO}/pulls/{PR_NUMBER}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github.v3.diff",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return resp.read().decode("utf-8", errors="replace")


def filter_diff(diff: str) -> str:
    """Remove generated/binary file sections from the diff."""
    lines = []
    skip = False
    for line in diff.splitlines(keepends=True):
        if line.startswith("diff --git"):
            skip = False
            filename = line.split(" b/")[-1].strip()
            if any(filename.endswith(ext) for ext in SKIP_EXTENSIONS):
                skip = True
            if any(p in filename for p in SKIP_PATHS):
                skip = True
        if not skip:
            lines.append(line)
    return "".join(lines)


def post_comment(body: str):
    """Post a comment on the PR."""
    gh_request("POST", f"/issues/{PR_NUMBER}/comments", {"body": body})


# ── Gemini API ───────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """\
You are an expert desktop application and front-end software reviewer specializing in Electron, \
Svelte 5 (Runes reactivity), Tailwind CSS, desktop screen/audio capturing pipelines, and embedded RPC communication.

The project is Bitnari Studio (`bitnari-studio`) — a high-performance desktop control application \
for ambient lighting and LED synchronization, featuring WindRPC (USB-CDC Serial, Wi-Fi UDP, BLE), \
real-time screen color sampling (DXGI/GDI), audio spectrum visualization, and adaptive power limiting.

Key rules to enforce during review:
- Svelte 5 Runes: Use modern `$state`, `$derived`, `$props`, and `$effect` correctly. Avoid legacy Svelte 3/4 stores or syntax.
- Electron Architecture & Security: Ensure strict context isolation via `contextBridge` in `preload.js`. Never expose raw Node.js internals to renderer.
- Zero Memory Leaks: Ensure all intervals, animation frames (`requestAnimationFrame`), event listeners, and UDP/Serial streams are properly cleaned up upon disconnection or modal close.
- WindRPC Protocol Compliance: Strictly adhere to the 6-byte Little-Endian binary header `[RPC_ID(2B)][SEQ_ID(2B)][LEN(2B)]`. Do not manually edit auto-generated `WindRpcClient.js`.
- Responsive UI & Performance: Keep 30Hz–60Hz rendering smooth without blocking the main UI thread. Maintain English UI text conventions and clean typographic alignment.

Provide a structured review with the following sections:
1. **Summary** — One-paragraph overview of what this PR does.
2. **Issues** — List any bugs, correctness problems, memory leaks, security risks, or rule violations. Use severity tags: `[CRITICAL]`, `[HIGH]`, `[MEDIUM]`, `[LOW]`.
3. **Suggestions** — Optional improvements (performance, Svelte 5 idioms, styling, UI consistency).
4. **Verdict** — One of: `✅ LGTM`, `⚠️ LGTM with minor suggestions`, or `❌ Changes requested`.

Be concise. Cite file paths and line numbers when possible.
"""


def call_gemini_model(model_name: str, diff: str) -> str:
    if len(diff) > MAX_DIFF_CHARS:
        diff = diff[:MAX_DIFF_CHARS] + "\n\n[... diff truncated for length ...]"

    prompt = f"Please review the following pull request diff:\n\n```diff\n{diff}\n```"
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model_name}:generateContent?key={GEMINI_API_KEY}"
    )
    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 8192,
        },
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        candidate = result.get("candidates", [{}])[0]
        content_parts = candidate.get("content", {}).get("parts", [])
        full_text = "".join(part.get("text", "") for part in content_parts)
        if not full_text:
            finish_reason = candidate.get("finishReason", "UNKNOWN")
            full_text = f"*(Review text was empty or filtered by API. Finish reason: `{finish_reason}`)*"
        return full_text


def call_gemini(diff: str) -> tuple[str, str]:
    """Send diff to Gemini with automatic model fallback."""
    models_to_try = [GEMINI_MODEL]
    if "gemini-2.5-flash" not in models_to_try:
        models_to_try.append("gemini-2.5-flash")
    if "gemini-1.5-flash" not in models_to_try:
        models_to_try.append("gemini-1.5-flash")

    last_err = ""
    for model in models_to_try:
        try:
            print(f"Calling Gemini model '{model}'...")
            review_text = call_gemini_model(model, diff)
            return review_text, model
        except urllib.error.HTTPError as e:
            err_text = e.read().decode("utf-8", errors="replace")
            print(f"Model '{model}' returned HTTP {e.code}: {err_text[:200]}...", file=sys.stderr)
            last_err = f"HTTP {e.code}: {err_text}"
            if e.code == 429:
                print(f"Quota exceeded for '{model}'. Trying fallback model...", file=sys.stderr)
                continue
            else:
                break
        except Exception as ex:
            print(f"Model '{model}' exception: {ex}", file=sys.stderr)
            last_err = str(ex)
            break

    # If all models failed due to quota or network
    return (
        f"⚠️ **Gemini Review Skipped Due to API Quota Limit**\n\n"
        f"Could not complete automated review because API quota was exceeded on the Google AI Studio Free Tier.\n\n"
        f"```\n{last_err[:500]}\n```\n\n"
        f"💡 *Tip: Comment `/gemini review` after a short cooldown or switch to a paid API tier.*",
        "gemini-fallback"
    )


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    print(f"Fetching diff for PR #{PR_NUMBER} in {REPO}...")
    raw_diff = get_pr_diff()
    filtered = filter_diff(raw_diff)

    if len(filtered.strip()) < 10:
        print("Diff is empty or only contains generated files. Skipping review.")
        post_comment(
            "🤖 **Gemini Code Review** — No reviewable changes detected "
            "(diff is empty or consists only of generated files)."
        )
        return

    print(f"Diff size: {len(filtered):,} chars. Calling Gemini ({GEMINI_MODEL})...")
    review, used_model = call_gemini(filtered)

    # Strip any redundant headers that Gemini might have included in its markdown
    import re
    clean_review = review.strip()
    clean_review = re.sub(r'^(#+\s*.*Gemini.*Code.*Review.*\n*)+', '', clean_review, flags=re.IGNORECASE)
    clean_review = re.sub(r'^(>\s*Model:.*\n*)+', '', clean_review, flags=re.IGNORECASE)
    clean_review = re.sub(r'^(>\s*Trigger:.*\n*)+', '', clean_review, flags=re.IGNORECASE)
    clean_review = re.sub(r'^(>\s*---\n*)+', '', clean_review)
    clean_review = re.sub(r'^(---+\n*)+', '', clean_review).strip()

    comment = (
        f"## 🤖 Gemini Code Review\n\n"
        f"> Model: `{used_model}` &nbsp;|&nbsp; "
        f"Trigger: automated on PR &nbsp;|&nbsp; "
        f"[Re-run: comment `/gemini review`]\n\n"
        f"---\n\n"
        f"{clean_review}\n\n"
        f"---\n"
        f"<sub>Generated by [gemini_review.py](.github/scripts/gemini_review.py). "
        f"Base: `{BASE_SHA[:7]}` → Head: `{HEAD_SHA[:7]}`</sub>"
    )
    post_comment(comment)
    print("Review posted successfully.")


if __name__ == "__main__":
    main()
