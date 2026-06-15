"""Runnable test for the pure-stdlib SERP HTML parser.

Run directly:  python worker/agents/serp_agent/parse_test.py
Exits 0 + prints "OK" on success, 1 on failure. No deps beyond stdlib.
"""

# #region Imports
import os
import sys

# Allow `python worker/agents/serp_agent/parse_test.py` from anywhere by
# putting the package's grandparent (the `worker/` dir) on sys.path so the
# relative `from parse import ...` works whether run as a script or module.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse import parse_serp_html  # noqa: E402
# #endregion

# #region Fixture
# The exact markup convention the parser expects: each result is one
# <div class="result"> container holding an <a class="result-url"> (href = url,
# text = title) and a <p class="result-snippet"> (text = snippet). Rank is the
# document order of the containers, starting at 1.
FIXTURE_HTML = """
<html><body>
  <div class="serp">
    <div class="result">
      <a class="result-url" href="https://example.com/alpha">Alpha Title</a>
      <p class="result-snippet">Alpha snippet text about the topic.</p>
    </div>
    <div class="result">
      <a class="result-url" href="https://example.com/beta">Beta &amp; Co</a>
      <p class="result-snippet">Beta snippet &lt;with entities&gt;.</p>
    </div>
    <div class="result">
      <a class="result-url" href="https://example.com/gamma">Gamma Title</a>
      <p class="result-snippet">Gamma snippet text.</p>
    </div>
  </div>
</body></html>
"""
# #endregion


# #region Assertions
def _run():
    results = parse_serp_html(FIXTURE_HTML)

    assert isinstance(results, list), "expected a list"
    assert len(results) == 3, f"expected 3 results, got {len(results)}"

    # Ranks are document order starting at 1.
    assert [r["rank"] for r in results] == [1, 2, 3], "ranks must be 1,2,3"

    # Result 1 — plain values.
    assert results[0]["url"] == "https://example.com/alpha"
    assert results[0]["title"] == "Alpha Title"
    assert results[0]["snippet"] == "Alpha snippet text about the topic."

    # Result 2 — HTML entities must be decoded in title + snippet.
    assert results[1]["url"] == "https://example.com/beta"
    assert results[1]["title"] == "Beta & Co", results[1]["title"]
    assert results[1]["snippet"] == "Beta snippet <with entities>.", results[1]["snippet"]

    # Result 3.
    assert results[2]["url"] == "https://example.com/gamma"
    assert results[2]["title"] == "Gamma Title"
    assert results[2]["snippet"] == "Gamma snippet text."

    # Every dict carries exactly the contract keys.
    for r in results:
        assert set(r.keys()) == {"rank", "url", "title", "snippet"}, r.keys()

    # Defensive: malformed / empty inputs => [].
    assert parse_serp_html("") == []
    assert parse_serp_html("   ") == []
    assert parse_serp_html("<html><body>no results here</body></html>") == []
    assert parse_serp_html("<div class=\"result\"><a href") == []  # truncated junk
    assert parse_serp_html(None) == []  # type: ignore[arg-type]
    assert parse_serp_html(12345) == []  # type: ignore[arg-type]


if __name__ == "__main__":
    try:
        _run()
    except AssertionError as exc:
        print(f"FAIL: {exc}")
        sys.exit(1)
    except Exception as exc:  # pragma: no cover - unexpected crash
        print(f"ERROR: {exc!r}")
        sys.exit(1)
    print("OK")
    sys.exit(0)
# #endregion
