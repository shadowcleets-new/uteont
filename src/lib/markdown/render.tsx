import { Fragment, type ReactNode } from "react";

/**
 * Minimal markdown → React renderer. Avoids pulling react-markdown to
 * keep the build hermetic; supports the constructs that show up in
 * agent-drafted articles:
 *
 *   - ATX headings (#, ##, ### up to ######)
 *   - Fenced code blocks (```lang\n…\n```)
 *   - Bulleted lists (-, *)
 *   - Ordered lists (1.)
 *   - Block quotes (>)
 *   - Inline: **bold**, *italic*, `code`, [text](url)
 *   - Plain paragraphs separated by blank lines
 *
 * Reference output is hand-tested in markdown.test.ts. The function is
 * deterministic — no DOM access — so it works in Server Components.
 *
 * If we ever need full CommonMark support, swap this for react-markdown
 * behind the same `<Markdown>` export.
 */

type Token =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string | null; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "p"; text: string };

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const UL_RE = /^[-*]\s+(.+)$/;
const OL_RE = /^\d+\.\s+(.+)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const FENCE_RE = /^```(\w*)\s*$/;

export function tokenize(input: string): Token[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const tokens: Token[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const lang = fence[1] || null;
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence
      tokens.push({ kind: "code", lang, text: body.join("\n") });
      continue;
    }

    const h = HEADING_RE.exec(line);
    if (h) {
      tokens.push({ kind: "heading", level: h[1].length, text: h[2].trim() });
      i++;
      continue;
    }

    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(lines[i])) {
        items.push(UL_RE.exec(lines[i])![1]);
        i++;
      }
      tokens.push({ kind: "ul", items });
      continue;
    }

    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(lines[i])) {
        items.push(OL_RE.exec(lines[i])![1]);
        i++;
      }
      tokens.push({ kind: "ol", items });
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const qlines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        qlines.push(QUOTE_RE.exec(lines[i])![1]);
        i++;
      }
      tokens.push({ kind: "quote", lines: qlines });
      continue;
    }

    // Plain paragraph — accumulate until blank or block boundary.
    const pLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING_RE.test(lines[i]) &&
      !UL_RE.test(lines[i]) &&
      !OL_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !FENCE_RE.test(lines[i])
    ) {
      pLines.push(lines[i]);
      i++;
    }
    tokens.push({ kind: "p", text: pLines.join(" ").trim() });
  }

  return tokens;
}

// --- Inline rendering ---------------------------------------------------

const INLINE_PATTERNS: Array<{
  re: RegExp;
  build: (m: RegExpExecArray, key: string) => ReactNode;
}> = [
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    build: (m, key) => (
      <a
        key={key}
        href={m[2]}
        target="_blank"
        rel="noreferrer"
        className="text-[#6a9bcc] underline decoration-[#cfccc1] hover:decoration-[#6a9bcc]"
      >
        {m[1]}
      </a>
    ),
  },
  {
    re: /\*\*([^*]+)\*\*/,
    build: (m, key) => (
      <strong key={key} className="font-semibold text-[#141413]">
        {m[1]}
      </strong>
    ),
  },
  {
    re: /\*([^*]+)\*/,
    build: (m, key) => (
      <em key={key} className="italic">
        {m[1]}
      </em>
    ),
  },
  {
    re: /`([^`]+)`/,
    build: (m, key) => (
      <code
        key={key}
        className="rounded bg-[#f3f1ea] px-1 py-0.5 text-[0.92em] font-mono text-[#141413]"
      >
        {m[1]}
      </code>
    ),
  },
];

export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let remaining = text;
  let key = 0;
  let safety = 0;

  while (remaining.length > 0 && safety++ < 1000) {
    let firstIdx = -1;
    let firstMatch: { re: RegExp; m: RegExpExecArray; build: (m: RegExpExecArray, key: string) => ReactNode } | null = null;

    for (const p of INLINE_PATTERNS) {
      const m = p.re.exec(remaining);
      if (m && (firstIdx === -1 || m.index < firstIdx)) {
        firstIdx = m.index;
        firstMatch = { re: p.re, m, build: p.build };
      }
    }

    if (!firstMatch) {
      out.push(remaining);
      break;
    }
    if (firstMatch.m.index > 0) {
      out.push(remaining.slice(0, firstMatch.m.index));
    }
    out.push(firstMatch.build(firstMatch.m, `inline-${key++}`));
    remaining = remaining.slice(firstMatch.m.index + firstMatch.m[0].length);
  }

  return out;
}

// --- Block rendering ----------------------------------------------------

const HEADING_CLS: Record<number, string> = {
  1: "text-[24px] font-semibold text-[#141413] tracking-tight mt-6 mb-3",
  2: "text-[20px] font-semibold text-[#141413] tracking-tight mt-6 mb-2",
  3: "text-[16px] font-semibold text-[#141413] tracking-tight mt-5 mb-2",
  4: "text-[14px] font-semibold text-[#141413] mt-4 mb-2",
  5: "text-[13px] font-semibold text-[#141413] mt-4 mb-1.5",
  6: "text-[12px] font-semibold text-[#9a988e] uppercase tracking-wider mt-4 mb-1.5",
};

export function Markdown({ source }: { source: string }) {
  const tokens = tokenize(source ?? "");
  return (
    <article
      className="text-[14px] leading-7 text-[#141413] [&_p]:mb-3 [&_p]:font-serif"
      data-testid="markdown-article"
    >
      {tokens.map((t, idx) => {
        const key = `tok-${idx}`;
        switch (t.kind) {
          case "heading": {
            const Tag = (`h${t.level}` as unknown) as keyof React.JSX.IntrinsicElements;
            return (
              <Tag key={key} className={HEADING_CLS[t.level]}>
                {renderInline(t.text)}
              </Tag>
            );
          }
          case "code":
            return (
              <pre
                key={key}
                className="my-4 overflow-x-auto rounded-md bg-[#141413] p-4 text-[12.5px] leading-5 text-emerald-200 font-mono"
              >
                <code data-lang={t.lang ?? undefined}>{t.text}</code>
              </pre>
            );
          case "ul":
            return (
              <ul
                key={key}
                className="list-disc pl-6 my-3 [&_li]:mb-1 [&_li]:font-serif marker:text-[#9a988e]"
              >
                {t.items.map((item, i) => (
                  <li key={`${key}-li-${i}`}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol
                key={key}
                className="list-decimal pl-6 my-3 [&_li]:mb-1 [&_li]:font-serif marker:text-[#9a988e]"
              >
                {t.items.map((item, i) => (
                  <li key={`${key}-li-${i}`}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={key}
                className="my-4 border-l-[3px] border-[#d97757] bg-[#faf9f5] px-4 py-2 text-[#6b6a64] font-serif italic"
              >
                {t.lines.map((line, i) => (
                  <Fragment key={`${key}-q-${i}`}>
                    {renderInline(line)}
                    {i < t.lines.length - 1 && <br />}
                  </Fragment>
                ))}
              </blockquote>
            );
          case "p":
            return <p key={key}>{renderInline(t.text)}</p>;
        }
      })}
    </article>
  );
}
