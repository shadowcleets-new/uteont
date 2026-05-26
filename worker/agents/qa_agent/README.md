# QA / Validation Agent

Agent 4 in the pipeline. Deterministic checks before any human review.
Pure-Python — no LLM required for the checks currently implemented.

## Input

- `article` — markdown text
- `target_keyword` — optional (must appear in body if provided)
- `forbidden` — optional set of disallowed phrases
- `pass_threshold` — default 70

## Output

```json
{
  "score": 78,
  "approved": true,
  "pass_threshold": 70,
  "issues": [
    {"severity": "med", "field": "voice", "message": "High passive voice (28%). Aim for <20%."}
  ],
  "metrics": {
    "word_count": 1240,
    "sentence_count": 72,
    "flesch_reading_ease": 64.3,
    "passive_voice_percent": 28.1,
    "long_sentence_count": 6
  },
  "plagiarism_status": "not_checked",
  "factuality_status": "not_checked"
}
```

## Checks implemented

| Check | Notes |
|---|---|
| Length | ≥ 200 words required for meaningful QA |
| Readability | Flesch Reading Ease, target 60+ |
| Passive voice | Heuristic (be-verb + past participle). Threshold 25% |
| Long sentences | Counts sentences > 30 words |
| Policy | Forbidden phrase substring match |
| Target keyword presence | High-severity flag if missing |

## Not yet checked (require LLM or external services)

- **Plagiarism** — needs a corpus + similarity check
- **Factuality** — needs LLM judgment / fact lookup
- **Brand voice** — needs LLM with a brand voice prompt

The output includes status fields for these so consumers can plan around
them.

## Approval rule

`approved = score >= pass_threshold AND no high-severity issues`

## CLI

```
python -m agents.qa_agent.qa_agent --file article.md \
    --target-keyword "ai writing tools"
```

## In the desktop app

Sidebar → **4. QA / Validation** → paste markdown → set target keyword
→ Run agent. Result appears in the Last Result panel.
