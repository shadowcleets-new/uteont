"""Runnable test for semantic_agent.profile.extract_structure.

Run directly:  python worker/agents/semantic_agent/profile_test.py
Stdlib only — plain asserts, deterministic fixture, no network/DB/clock.
Prints "OK" and sys.exit(0) on success, else sys.exit(1).
"""

import os
import sys

# Allow running as a bare script (python .../profile_test.py) by ensuring the
# package parent ("agents/") is importable, then import via relative-ish path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from profile import extract_structure  # noqa: E402

# #region Fixtures

FIXTURE_HTML = """
<!DOCTYPE html>
<html>
<head>
  <title>Ignored Title</title>
  <style>.x { color: red; }</style>
  <script>var secretWord = "ZZZSCRIPTONLY ZZZSCRIPTONLY ZZZSCRIPTONLY";</script>
</head>
<body>
  <h1>Travel Guide</h1>
  <p>Welcome to our guide. New York is a wonderful city to visit.
     The Empire State Building stands tall in New York.</p>
  <h2>Getting Around</h2>
  <p>Many people love New York for its food and culture.</p>
  <script>console.log("inline script should be ignored");</script>
</body>
</html>
"""

# #endregion

# #region Tests


def _test_headings_in_order():
    result = extract_structure(FIXTURE_HTML)
    assert result["headings"] == ["Travel Guide", "Getting Around"], result["headings"]


def _test_word_count_excludes_script_and_style():
    result = extract_structure(FIXTURE_HTML)
    wc = result["word_count"]
    assert wc > 0, wc
    # The marker word lives only inside <script>/<style>; must not be counted.
    visible_blob = " ".join(
        [" ".join(result["headings"]), str(result["entities"])]
    )
    # Stronger: re-derive by asserting the script marker is absent from entities
    assert "ZZZSCRIPTONLY" not in visible_blob, "script content leaked into output"
    # The marker also must not have inflated the word count beyond visible text.
    # Visible text has well under 40 words; script tripled marker would push higher.
    assert wc < 40, wc


def _test_proper_noun_detected():
    result = extract_structure(FIXTURE_HTML)
    entities = result["entities"]
    assert "New York" in entities, entities
    # Frequency ordering: "New York" (3x) should precede single-mention entities.
    if "Empire State Building" in entities:
        assert entities.index("New York") < entities.index("Empire State Building"), entities


def _test_defensive_empty_and_malformed():
    assert extract_structure("") == {"headings": [], "word_count": 0, "entities": []}
    assert extract_structure(None) == {"headings": [], "word_count": 0, "entities": []}  # type: ignore[arg-type]
    # Malformed / unclosed tags must not raise.
    broken = extract_structure("<h1>Broken <h2>Nested <p>oops")
    assert isinstance(broken, dict)
    assert "headings" in broken and "word_count" in broken and "entities" in broken


def _test_entities_deterministic_dedup():
    result = extract_structure(FIXTURE_HTML)
    entities = result["entities"]
    # Deduped: "New York" appears once despite 3 mentions.
    assert entities.count("New York") == 1, entities
    # Stable across repeated calls.
    again = extract_structure(FIXTURE_HTML)["entities"]
    assert entities == again, (entities, again)


# #endregion

# #region Runner


def main():
    _test_headings_in_order()
    _test_word_count_excludes_script_and_style()
    _test_proper_noun_detected()
    _test_defensive_empty_and_malformed()
    _test_entities_deterministic_dedup()
    print("OK")
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print("FAIL:", exc, file=sys.stderr)
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001 — surface any crash as a failure
        print("ERROR:", repr(exc), file=sys.stderr)
        sys.exit(1)


# #endregion
