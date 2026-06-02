import { Fragment, type ReactNode } from "react";

export interface RenderMarkdownLiteOptions {
  /** When true, block lists render as plain text (quoted previews, pin excerpts). */
  compact?: boolean;
}

type ListBlock = { type: "ul"; items: string[] };
type ParaBlock = { type: "p"; lines: string[] };
type BodyBlock = ListBlock | ParaBlock;

const LIST_LINE_RE = /^[-*]\s+(.+)$/;
const CODE_RE = /`([^`\n]+?)`/g;
const BOLD_RE = /\*\*([^*\n]+?)\*\*/;
const ITALIC_STAR_RE = /(?<![a-zA-Z0-9])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![a-zA-Z0-9])/;
const ITALIC_UNDER_RE = /(?<![a-zA-Z0-9])_(?!\s)([^_\n]+?)(?<!\s)_(?![a-zA-Z0-9])/;
const STRIKE_RE = /~~([^~\n]+?)~~/;
/** Only https:// links are accepted; http:// and javascript: do not match. */
const LINK_RE = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/;

type InlinePattern = {
  type: "bold" | "italic_star" | "italic_under" | "strike" | "link";
  re: RegExp;
};

const INLINE_PATTERNS: InlinePattern[] = [
  { type: "bold", re: BOLD_RE },
  { type: "italic_star", re: ITALIC_STAR_RE },
  { type: "italic_under", re: ITALIC_UNDER_RE },
  { type: "strike", re: STRIKE_RE },
  { type: "link", re: LINK_RE },
];

function tokenizeBlocks(body: string, compact?: boolean): BodyBlock[] {
  const lines = body.split("\n");
  const blocks: BodyBlock[] = [];
  let listItems: string[] | null = null;
  let paraLines: string[] = [];

  const flushPara = () => {
    if (paraLines.length > 0) {
      blocks.push({ type: "p", lines: [...paraLines] });
      paraLines = [];
    }
  };

  const flushList = () => {
    if (listItems && listItems.length > 0) {
      blocks.push({ type: "ul", items: listItems });
      listItems = null;
    }
  };

  for (const line of lines) {
    const listMatch = !compact ? LIST_LINE_RE.exec(line) : null;
    if (listMatch) {
      flushPara();
      if (!listItems) listItems = [];
      listItems.push(listMatch[1]);
    } else {
      flushList();
      paraLines.push(line);
    }
  }

  flushList();
  flushPara();
  return blocks;
}

function findEarliestInlineMatch(
  text: string,
): { index: number; length: number; type: InlinePattern["type"]; groups: RegExpMatchArray } | null {
  let best: {
    index: number;
    length: number;
    type: InlinePattern["type"];
    groups: RegExpMatchArray;
  } | null = null;

  for (const { type, re } of INLINE_PATTERNS) {
    const reCopy = new RegExp(re.source, re.flags);
    const m = reCopy.exec(text);
    if (!m || m.index === undefined) continue;
    if (!best || m.index < best.index) {
      best = { index: m.index, length: m[0].length, type, groups: m };
    }
  }

  return best;
}

function renderInlineRaw(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let part = 0;

  while (remaining.length > 0) {
    const match = findEarliestInlineMatch(remaining);
    if (!match) {
      nodes.push(remaining);
      break;
    }

    if (match.index > 0) {
      nodes.push(remaining.slice(0, match.index));
    }

    const k = `${keyPrefix}-i-${part++}`;
    switch (match.type) {
      case "bold":
        nodes.push(<strong key={k}>{match.groups[1]}</strong>);
        break;
      case "italic_star":
      case "italic_under":
        nodes.push(<em key={k}>{match.groups[1]}</em>);
        break;
      case "strike":
        nodes.push(<s key={k}>{match.groups[1]}</s>);
        break;
      case "link":
        nodes.push(
          <a
            key={k}
            href={match.groups[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-blue-600"
          >
            {match.groups[1]}
          </a>,
        );
        break;
      default:
        nodes.push(remaining.slice(match.index, match.index + match.length));
    }

    remaining = remaining.slice(match.index + match.length);
  }

  return nodes;
}

function renderInlineSegment(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let part = 0;

  while (remaining.length > 0) {
    CODE_RE.lastIndex = 0;
    const codeMatch = CODE_RE.exec(remaining);
    if (!codeMatch || codeMatch.index === undefined) {
      nodes.push(...renderInlineRaw(remaining, `${keyPrefix}-r-${part++}`));
      break;
    }

    if (codeMatch.index > 0) {
      nodes.push(
        ...renderInlineRaw(remaining.slice(0, codeMatch.index), `${keyPrefix}-r-${part++}`),
      );
    }

    nodes.push(
      <code
        key={`${keyPrefix}-c-${part++}`}
        className="rounded bg-gray-100 px-1 font-mono text-sm"
      >
        {codeMatch[1]}
      </code>,
    );

    remaining = remaining.slice(codeMatch.index + codeMatch[0].length);
  }

  return nodes;
}

function renderParagraphLines(lines: string[], keyPrefix: string): ReactNode {
  return (
    <>
      {lines.map((line, li) => (
        <Fragment key={`${keyPrefix}-l-${li}`}>
          {li > 0 ? "\n" : null}
          {renderInlineSegment(line, `${keyPrefix}-l-${li}`)}
        </Fragment>
      ))}
    </>
  );
}

/**
 * XSS-safe markdown-lite renderer. Builds React VDOM only — no raw HTML injection.
 * Newlines in non-list paragraphs are preserved via literal `\n` text nodes;
 * the parent `.message-body` uses `whitespace-pre-wrap` (see MessageBubble).
 */
export function renderMarkdownLite(
  body: string,
  opts?: RenderMarkdownLiteOptions,
): ReactNode {
  const blocks = tokenizeBlocks(body, opts?.compact);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <>
      {blocks.map((block, bi) => {
        if (block.type === "ul") {
          return (
            <ul key={`ul-${bi}`} className="my-1 list-disc pl-4">
              {block.items.map((item, ii) => (
                <li key={`li-${bi}-${ii}`}>{renderInlineSegment(item, `ul-${bi}-${ii}`)}</li>
              ))}
            </ul>
          );
        }
        return <Fragment key={`p-${bi}`}>{renderParagraphLines(block.lines, `p-${bi}`)}</Fragment>;
      })}
    </>
  );
}

export type MarkdownToolbarAction = "bold" | "italic" | "strike" | "code" | "link" | "list";

const TOOLBAR_WRAP: Record<
  MarkdownToolbarAction,
  { before: string; after: string; placeholder: string }
> = {
  bold: { before: "**", after: "**", placeholder: "bold" },
  italic: { before: "*", after: "*", placeholder: "italic" },
  strike: { before: "~~", after: "~~", placeholder: "strike" },
  code: { before: "`", after: "`", placeholder: "code" },
  link: { before: "[", after: "](https://)", placeholder: "label" },
  list: { before: "- ", after: "", placeholder: "item" },
};

/**
 * Wraps the current textarea selection with markdown-lite markers (Slack-style toolbar).
 */
export function applyMarkdownToolbarAction(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (next: string) => void,
  action: MarkdownToolbarAction,
): void {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const selected = value.slice(start, end);
  const wrap = TOOLBAR_WRAP[action];

  let insertion: string;
  if (action === "list") {
    if (selected.includes("\n")) {
      insertion = selected
        .split("\n")
        .map((line) => (LIST_LINE_RE.test(line) ? line : `- ${line}`))
        .join("\n");
    } else {
      const inner = selected || wrap.placeholder;
      insertion = selected && LIST_LINE_RE.test(selected) ? selected : `- ${inner}`;
    }
  } else {
    const inner = selected || wrap.placeholder;
    insertion = `${wrap.before}${inner}${wrap.after}`;
  }

  const next = value.slice(0, start) + insertion + value.slice(end);
  onChange(next);

  const cursorStart = start + (action === "list" ? 0 : wrap.before.length);
  const cursorEnd =
    action === "list"
      ? start + insertion.length
      : cursorStart + (selected || wrap.placeholder).length;

  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursorStart, cursorEnd);
  });
}
