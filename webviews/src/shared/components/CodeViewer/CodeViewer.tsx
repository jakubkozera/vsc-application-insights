import React, { useCallback, useMemo, useRef } from 'react';
import styles from './CodeViewer.module.css';

export interface CodeViewerProps {
  value: string;
  language?: 'json' | 'xml' | 'plaintext';
  maxHeight?: number | string;
  /** Called when user clicks a JSON string value that is itself valid JSON */
  onJsonStringClick?: (key: string, value: string) => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ value, language = 'plaintext', maxHeight, onJsonStringClick }) => {
  const lines = useMemo(() => value.split('\n'), [value]);
  const containerRef = useRef<HTMLDivElement>(null);

  const highlighted = useMemo(() => {
    if (language === 'json') return colorizeJson(value, !!onJsonStringClick);
    if (language === 'xml') return colorizeXml(value);
    return escapeHtml(value);
  }, [value, language, onJsonStringClick]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!onJsonStringClick) return;
    const target = e.target as HTMLElement;
    const clickable = target.closest(`[data-json-key]`) as HTMLElement | null;
    if (clickable) {
      const key = clickable.getAttribute('data-json-key') ?? '';
      const raw = clickable.getAttribute('data-json-value') ?? '';
      onJsonStringClick(key, raw);
    }
  }, [onJsonStringClick]);

  return (
    <div className={styles.codeViewer} style={maxHeight ? { maxHeight } : undefined} ref={containerRef} onClick={handleClick}>
      <div className={styles.lineNumbers}>
        {lines.map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <pre className={styles.code} dangerouslySetInnerHTML={{ __html: highlighted }} />
    </div>
  );
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isJsonString(str: string): boolean {
  if (str.length < 2) return false;
  const trimmed = str.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { JSON.parse(trimmed); return true; } catch { return false; }
  }
  return false;
}

function colorizeJson(json: string, detectClickable: boolean): string {
  const escaped = json
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let lastKey = '';

  return escaped.replace(
    /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (_match, str, trailingColon, kw, num) => {
      if (str !== undefined) {
        if (trailingColon) {
          // This is a key
          lastKey = str.slice(1, -1); // unquoted key name (still html-escaped)
          return `<span class="${styles.key}">${str}</span>${trailingColon}`;
        }
        // This is a string value – check if it's a JSON string
        if (detectClickable) {
          // Decode escaped html entities back to check if it's JSON
          const raw = str.slice(1, -1)
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/\\"/g, '"').replace(/\\\\/g, '\\')
            .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
          if (isJsonString(raw)) {
            // Encode the raw value for the data attribute (escape quotes and html)
            const encodedValue = raw.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const keyDecoded = lastKey.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            const encodedKey = keyDecoded.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<span class="${styles.string} ${styles.jsonClickable}" data-json-key="${encodedKey}" data-json-value="${encodedValue}" title="Click to expand JSON">${str}</span>`;
          }
        }
        return `<span class="${styles.string}">${str}</span>`;
      }
      if (kw !== undefined) return `<span class="${styles.keyword}">${kw}</span>`;
      if (num !== undefined) return `<span class="${styles.number}">${num}</span>`;
      return _match;
    }
  );
}

function colorizeXml(xml: string): string {
  return escapeHtml(xml)
    .replace(/(&lt;\/?)([\w:-]+)/g, `$1<span class="${styles.key}">$2</span>`)
    .replace(/([\w:-]+)(=)(&quot;[^&]*&quot;|"[^"]*")/g, `<span class="${styles.number}">$1</span>$2<span class="${styles.string}">$3</span>`)
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, `<span class="${styles.comment}">$1</span>`);
}
