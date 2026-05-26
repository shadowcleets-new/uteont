# SEO Optimization Agent

Agent 5 in the pipeline. Pure-Python deterministic SEO linter for markdown
articles. No LLM required.

## Input

- `article` — markdown text
- `target_keyword` — optional primary keyword to optimize for

## Output

Structured report:

```json
{
  "score": 84,
  "issues": [
    {"severity": "med", "field": "title", "message": "Title is short (28 chars). Aim for 50-60."}
  ],
  "title": "...",
  "word_count": 1240,
  "heading_structure": [{"level": 1, "text": "..."}, ...],
  "keyword_density_percent": {"ai writing tools": 1.2},
  "suggested_meta_description": "...",
  "suggested_schema_jsonld": { ... }
}
```

## Checks

| Field | Heuristic |
|---|---|
| Title | length 50–60 chars; contains target keyword |
| Headings | starts with H1; no level jumps > 1 |
| Body | 800+ words preferred (300 min) |
| Readability | avg sentence length ≤ 25 words |
| Keyword density | target between 0.5%–2% |

Issues are tagged `high` / `med` / `low`. Each issue subtracts from the
score (starts at 100, floor at 0).

## CLI

```
python -m agents.seo_optimization_agent.seo_agent --file article.md \
    --target-keyword "ai writing tools"
```

Or pipe markdown via stdin.

## In the desktop app

Sidebar → **5. SEO Optimization** → paste markdown → set target keyword
→ Run agent. Result appears in the Last Result panel as JSON.
