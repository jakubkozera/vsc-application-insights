import React from 'react';
import { IconBrandGithubCopilot, IconTableExport } from '@tabler/icons-react';
import { useVSCodeMessaging } from '@shared/hooks';
import styles from './TableExportControl.module.css';

interface ExportColumn {
  key: string;
  label: string;
}

interface TableExportControlProps {
  rows: Record<string, unknown>[];
  columns: ExportColumn[];
  fileName: string;
}

export const TableExportControl: React.FC<TableExportControlProps> = ({ rows, columns, fileName }) => {
  const { postMessage } = useVSCodeMessaging<any, any>();

  const handleExport = (format: 'csv' | 'excel') => {
    postMessage({ command: 'exportData', format, rows, columns, fileName });
  };

  if (!rows.length) {
    return null;
  }

  return (
    <div className={styles.container}>
      <details className={styles.details}>
        <summary className={styles.button}>
          <IconTableExport size={14} />
          <span>Export</span>
        </summary>
        <div className={styles.menu}>
          <button type="button" className={styles.menuItem} onClick={() => handleExport('csv')}>
            CSV
          </button>
          <button type="button" className={styles.menuItem} onClick={() => handleExport('excel')}>
            Excel
          </button>
        </div>
      </details>
      <button
        type="button"
        className={styles.button}
        title="Analyze with GitHub Copilot"
        onClick={() => postMessage({ command: 'analyzeData', rows, columns, fileName })}
      >
        <IconBrandGithubCopilot size={14} stroke={1.5} aria-hidden="true" />
        <span>Analyze</span>
      </button>
    </div>
  );
};
