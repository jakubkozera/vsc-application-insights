import React, { useMemo, useState } from 'react';
import { IconCopy, IconFilter, IconFilterOff } from '@tabler/icons-react';
import styles from './CallStack.module.css';

interface StackFrame {
  assembly: string;
  method: string;
  level: number;
  line: number;
  fileName?: string;
}

interface ExceptionDetail {
  outerId?: string;
  message: string;
  type: string;
  id?: string;
  parsedStack?: StackFrame[];
  severityLevel?: string;
}

export interface CallStackProps {
  details: string;
}

const SYSTEM_ASSEMBLIES = [
  'System.',
  'Microsoft.',
  'Polly.',
  'Azure.',
  'Newtonsoft.',
  'MediatR.',
];

function isUserCode(frame: StackFrame): boolean {
  return !SYSTEM_ASSEMBLIES.some(prefix => frame.assembly.startsWith(prefix));
}

function parseDetails(details: string): ExceptionDetail[] {
  try {
    const parsed = JSON.parse(details);
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch {
    return [];
  }
}

export const CallStack: React.FC<CallStackProps> = ({ details }) => {
  const [justMyCode, setJustMyCode] = useState(true);

  const exceptions = useMemo(() => parseDetails(details), [details]);

  const copyStack = () => {
    const text = exceptions
      .map(ex => {
        const header = `${ex.type}: ${ex.message}`;
        const frames = (ex.parsedStack ?? [])
          .map(f => {
            const loc = f.fileName && f.line ? ` in ${f.fileName}:line ${f.line}` : '';
            return `   at ${f.method}${loc}`;
          })
          .join('\n');
        return `${header}\n${frames}`;
      })
      .join('\n\n');
    navigator.clipboard.writeText(text);
  };

  if (exceptions.length === 0) {
    return <div className={styles.empty}>No stack trace available</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <button
          className={`${styles.toggleBtn} ${justMyCode ? styles.active : ''}`}
          onClick={() => setJustMyCode(!justMyCode)}
          title={justMyCode ? 'Show all code' : 'Just My Code'}
        >
          {justMyCode ? <IconFilter size={14} /> : <IconFilterOff size={14} />}
          <span>Just My Code</span>
        </button>
        <button className={styles.copyBtn} onClick={copyStack} title="Copy stack trace">
          <IconCopy size={14} />
          <span>Copy</span>
        </button>
      </div>

      {exceptions.map((ex, exIdx) => (
        <div key={exIdx} className={styles.exceptionBlock}>
          <div className={styles.exceptionHeader}>
            <span className={styles.exceptionType}>{ex.type}</span>
            {ex.message && <span className={styles.exceptionMessage}>{ex.message}</span>}
          </div>
          <div className={styles.frames}>
            {(ex.parsedStack ?? []).map((frame, fIdx) => {
              const userCode = isUserCode(frame);
              if (justMyCode && !userCode) {
                // Show collapsed indicator for consecutive system frames
                const prevFrame = ex.parsedStack?.[fIdx - 1];
                const prevIsSystem = prevFrame && !isUserCode(prevFrame);
                if (prevIsSystem) return null;
                // Count consecutive system frames
                let count = 0;
                for (let i = fIdx; i < (ex.parsedStack?.length ?? 0); i++) {
                  if (!isUserCode(ex.parsedStack![i])) count++;
                  else break;
                }
                return (
                  <div key={fIdx} className={styles.collapsedFrames}>
                    [{count} external frame{count > 1 ? 's' : ''}]
                  </div>
                );
              }
              return (
                <div
                  key={fIdx}
                  className={`${styles.frame} ${userCode ? styles.userFrame : styles.systemFrame}`}
                >
                  <span className={styles.frameMethod}>{frame.method}</span>
                  {frame.fileName && frame.line > 0 && (
                    <span className={styles.frameLocation}>
                      {frame.fileName.split('\\').pop()}:{frame.line}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
