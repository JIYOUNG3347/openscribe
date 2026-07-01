import React from 'react';
import { Check, Clock, User } from 'lucide-react';
import { cx } from './ds';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** When set, '- [ ]/[x]' render as interactive checkboxes; index = checkbox occurrence (0-based). */
  onToggleCheckbox?: (index: number) => void;
}

const S = {
  h1: 'text-xl font-bold text-ink mt-5 mb-2',
  h2: 'text-lg font-bold text-ink mt-4 mb-2',
  h3: 'text-base font-semibold text-ink mt-3 mb-1',
  h4: 'text-sm font-semibold text-ink-soft mt-2 mb-1',
  p: 'text-sm text-ink leading-relaxed my-1',
  list: 'list-inside space-y-0.5 my-1 text-sm text-ink-soft',
  code: 'text-sm',
  quote: 'text-sm',
};

export function MarkdownRenderer({ content, className = '', onToggleCheckbox }: MarkdownRendererProps) {
  const rendered = parseMarkdown(content, onToggleCheckbox);
  return <div className={`markdown-rendered ${className}`}>{rendered}</div>;
}

function parseMarkdown(text: string, onToggle?: (index: number) => void): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  let checkboxIndex = 0; // 문서 순서대로 증가 — ResultPage 의 토글 인덱스와 일치
  let pendingSectionColor: string | null = null;

  while (i < lines.length) {
    const line = lines[i];

    // Section color comment: <!-- section-color:#xxx -->
    const colorMatch = line.match(/^<!--\s*section-color:\s*(#[0-9a-fA-F]{3,8})\s*-->$/);
    if (colorMatch) {
      pendingSectionColor = colorMatch[1];
      i++;
      continue;
    }

    // Code block
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={key++} className="bg-subtle border border-line rounded-card p-3 my-2 overflow-x-auto">
          <code className={`${S.code} font-mono text-ink`}>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />);
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4;
      const headingText = headingMatch[2];
      const hKey = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';

      if (pendingSectionColor) {
        const color = pendingSectionColor;
        pendingSectionColor = null;
        elements.push(
          <div
            key={key++}
            className={`${S[hKey]} pl-3 border-l-4 rounded-sm`}
            style={{
              borderLeftColor: color,
              backgroundColor: `${color}08`,
            }}
          >
            {renderInline(headingText)}
          </div>
        );
      } else {
        elements.push(
          <div key={key++} className={S[hKey]}>
            {renderInline(headingText)}
          </div>
        );
      }
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      elements.push(<hr key={key++} className="border-line my-3" />);
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s/.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*+]\s/.test(lines[i])) {
        const itemMatch = lines[i].match(/^\s*[-*+]\s+(.+)$/);
        if (itemMatch) {
          // Check for checkbox
          const checkMatch = itemMatch[1].match(/^\[([ xX])\]\s*(.+)$/);
          if (checkMatch) {
            const checked = checkMatch[1] !== ' ';
            const meta = parseActionMeta(checkMatch[2]);
            const cbIndex = checkboxIndex++;
            const boxBase = 'mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center';
            const boxState = checked ? 'bg-accent border-accent text-white' : 'bg-surface border-line-strong';
            listItems.push(
              <li key={key++} className="flex items-start gap-2 py-1">
                {onToggle ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => onToggle(cbIndex)}
                    className={cx(boxBase, boxState, 'transition-colors focus-ring cursor-pointer hover:border-accent')}
                  >
                    {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                  </button>
                ) : (
                  <span className={cx(boxBase, boxState)}>
                    {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                )}
                <span className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
                  {meta.text && (
                    <span className={checked ? 'line-through text-ink-faint' : 'text-ink'}>{renderInline(meta.text)}</span>
                  )}
                  {meta.assignee && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-ink-soft text-xs font-medium">
                      <User className="w-3 h-3" /> {meta.assignee}
                    </span>
                  )}
                  {meta.due && <DuePill due={meta.due} />}
                </span>
              </li>
            );
          } else {
            listItems.push(
              <li key={key++} className="py-0.5">{renderInline(itemMatch[1])}</li>
            );
          }
        }
        i++;
      }
      elements.push(
        <ul key={key++} className={`list-disc ${S.list}`}>
          {listItems}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s/.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s/.test(lines[i])) {
        const itemMatch = lines[i].match(/^\s*\d+[.)]\s+(.+)$/);
        if (itemMatch) {
          listItems.push(
            <li key={key++} className="py-0.5">{renderInline(itemMatch[1])}</li>
          );
        }
        i++;
      }
      elements.push(
        <ol key={key++} className={`list-decimal ${S.list}`}>
          {listItems}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote key={key++} className={`border-l-3 border-line-strong pl-3 my-2 text-ink-soft italic ${S.quote}`}>
          {renderInline(quoteLines.join(' '))}
        </blockquote>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className={S.p}>
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return elements;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text** or __text__
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/s) || remaining.match(/^(.*?)__(.+?)__/s);
    if (boldMatch && boldMatch.index === 0) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++} className="font-semibold text-ink">{boldMatch[2]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Inline code: `code`
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`/);
    if (codeMatch && codeMatch.index === 0) {
      if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>);
      parts.push(
        <code key={key++} className="bg-muted text-accent-ink px-1.5 py-0.5 rounded text-xs font-mono">
          {codeMatch[2]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Italic: *text* or _text_ (single)
    const italicMatch = remaining.match(/^(.*?)\*([^*]+)\*/s) || remaining.match(/^(.*?)_([^_]+)_/s);
    if (italicMatch && italicMatch.index === 0) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
      parts.push(<em key={key++} className="italic">{italicMatch[2]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // No more matches — push rest as text
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/** 액션아이템 메타 '[@담당자 ~MM/DD]' 를 파싱하고 본문에서 제거 */
function parseActionMeta(raw: string): { text: string; assignee?: string; due?: string } {
  let assignee: string | undefined;
  let due: string | undefined;
  const text = raw
    .replace(/\[\s*(?:@([^~\]]+))?\s*(?:~\s*(\d{1,2}\/\d{1,2}))?\s*\]/g, (m, a, d) => {
      if (!a && !d) return m; // 메타 토큰이 아니면 그대로 둠
      if (a) assignee = a.trim();
      if (d) due = d.trim();
      return '';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { text, assignee, due };
}

/** 기한 pill — 초과(danger) / 임박 3일 이내(warning) / 그 외(중립) */
function DuePill({ due }: { due: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium tabular', dueClass(due))}>
      <Clock className="w-3 h-3" /> {due}
    </span>
  );
}

function dueClass(due: string): string {
  const m = due.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return 'bg-muted text-ink-soft';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]));
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'bg-danger-subtle text-danger'; // 초과
  if (diffDays <= 3) return 'bg-warning-subtle text-warning'; // 임박
  return 'bg-muted text-ink-soft';
}
