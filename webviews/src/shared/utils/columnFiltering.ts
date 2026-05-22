export type FilterOp = 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'gt' | 'gte' | 'lt' | 'lte' | 'before' | 'after';

export interface ColumnFilter {
  op: FilterOp;
  value: string;
  selectedValues?: string[];
}

interface Column {
  name: string;
  type: string;
}

export function getColumnFilterType(colType: string): 'text' | 'number' | 'date' {
  const t = colType.toLowerCase();
  if (t === 'int' || t === 'long' || t === 'real' || t === 'double' || t === 'decimal') return 'number';
  if (t === 'datetime' || t === 'timespan') return 'date';
  return 'text';
}

export function getOpsForType(type: 'text' | 'number' | 'date') {
  if (type === 'number') return NUMBER_OPS;
  if (type === 'date') return DATE_OPS;
  return TEXT_OPS;
}

export function getDefaultOp(type: 'text' | 'number' | 'date'): FilterOp {
  if (type === 'number') return 'gte';
  if (type === 'date') return 'after';
  return 'contains';
}

export function matchesFilter(cellValue: unknown, filter: ColumnFilter, type: 'text' | 'number' | 'date'): boolean {
  const displayValue = formatFilterValue(cellValue);

  if (type === 'text' && filter.selectedValues) {
    if (filter.selectedValues.length === 0) return false;
    if (!filter.selectedValues.includes(displayValue)) return false;
  }

  const val = filter.value;
  if (!val) return true;

  if (type === 'number') {
    const num = Number(val);
    const cell = typeof cellValue === 'number' ? cellValue : Number(cellValue ?? 0);
    if (Number.isNaN(num)) return true;
    switch (filter.op) {
      case 'equals': return cell === num;
      case 'gt': return cell > num;
      case 'gte': return cell >= num;
      case 'lt': return cell < num;
      case 'lte': return cell <= num;
      default: return true;
    }
  }

  if (type === 'date') {
    const cellTime = toComparableTime(cellValue);
    const filterTime = toComparableTime(val);
    if (cellTime === null || filterTime === null) return true;

    switch (filter.op) {
      case 'after': return cellTime >= filterTime;
      case 'before': return cellTime <= filterTime;
      case 'equals': return Math.abs(cellTime - filterTime) < 60_000;
      default: return true;
    }
  }

  const cellStr = displayValue.toLowerCase();
  const search = val.toLowerCase();
  switch (filter.op) {
    case 'contains': return cellStr.includes(search);
    case 'equals': return cellStr === search;
    case 'startsWith': return cellStr.startsWith(search);
    case 'endsWith': return cellStr.endsWith(search);
    default: return true;
  }
}

export function applyColumnFilters(
  rows: Record<string, unknown>[],
  columns: Column[],
  columnFilters: Record<string, ColumnFilter>,
  excludeColumn?: string,
): Record<string, unknown>[] {
  let filteredRows = rows;
  for (const [colName, filter] of Object.entries(columnFilters)) {
    if (colName === excludeColumn) continue;
    const hasTextValue = Boolean(filter.value);
    const hasSelectedValues = Array.isArray(filter.selectedValues);
    if (!hasTextValue && !hasSelectedValues) continue;

    const column = columns.find((candidate) => candidate.name === colName);
    const type = column ? getColumnFilterType(column.type) : 'text';
    filteredRows = filteredRows.filter((row) => matchesFilter(row[colName], filter, type));
  }
  return filteredRows;
}

export function getDistinctColumnValues(rows: Record<string, unknown>[], columnName: string): string[] {
  return Array.from(new Set(rows.map((row) => formatFilterValue(row[columnName])))).sort((left, right) => left.localeCompare(right));
}

export function formatFilterValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toComparableTime(value: unknown): number | null {
  const normalized = normalizeDateInput(String(value ?? ''));
  if (!normalized) return null;
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? null : time;
}

function normalizeDateInput(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00`;
  return value;
}

const TEXT_OPS: { value: FilterOp; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'startsWith', label: 'Starts with' },
  { value: 'endsWith', label: 'Ends with' },
];

const NUMBER_OPS: { value: FilterOp; label: string }[] = [
  { value: 'equals', label: '=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
];

const DATE_OPS: { value: FilterOp; label: string }[] = [
  { value: 'after', label: 'After' },
  { value: 'before', label: 'Before' },
  { value: 'equals', label: 'At time' },
];