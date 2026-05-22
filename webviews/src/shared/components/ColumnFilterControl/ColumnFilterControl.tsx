import React, { useMemo, useState } from 'react';
import { IconFilter, IconX } from '@tabler/icons-react';
import styles from './ColumnFilterControl.module.css';
import { ColumnFilter, FilterOp, getDefaultOp, getOpsForType } from '@shared/utils/columnFiltering';

interface ColumnFilterControlProps {
  columnName: string;
  type: 'text' | 'number' | 'date';
  filter?: ColumnFilter;
  active: boolean;
  uniqueValues?: string[];
  onToggle: () => void;
  onChange: (nextFilter: ColumnFilter) => void;
  onClear: () => void;
}

export const ColumnFilterControl: React.FC<ColumnFilterControlProps> = ({
  columnName,
  type,
  filter,
  active,
  uniqueValues = [],
  onToggle,
  onChange,
  onClear,
}) => {
  const [valueSearch, setValueSearch] = useState('');
  const defaultOp = getDefaultOp(type);
  const ops = getOpsForType(type);
  const filteredValues = useMemo(() => {
    const needle = valueSearch.trim().toLowerCase();
    if (!needle) return uniqueValues;
    return uniqueValues.filter((value) => value.toLowerCase().includes(needle));
  }, [uniqueValues, valueSearch]);

  const toggleValue = (value: string) => {
    const currentlySelected = filter?.selectedValues ?? uniqueValues;
    const nextSelected = currentlySelected.includes(value)
      ? currentlySelected.filter((candidate) => candidate !== value)
      : uniqueValues.filter((candidate) => currentlySelected.includes(candidate) || candidate === value);

    onChange({
      op: filter?.op ?? defaultOp,
      value: filter?.value ?? '',
      selectedValues: nextSelected.length === uniqueValues.length ? undefined : nextSelected,
    });
  };

  const selectAllValues = () => {
    onChange({ op: filter?.op ?? defaultOp, value: filter?.value ?? '', selectedValues: undefined });
  };

  return (
    <>
      <button
        className={`${styles.filterBtn} ${active || filter ? styles.filterBtnActive : ''} ${styles.filterBtnVisible}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        title="Filter"
        aria-label={`Filter ${columnName}`}
        data-column-filter-button="true"
      >
        <IconFilter size={12} stroke={2} />
      </button>

      {active && (
        <div className={styles.filterPopup} onClick={(event) => event.stopPropagation()} data-column-filter-popup="true">
          <div className={styles.filterRow}>
            <select
              className={styles.filterSelect}
              value={filter?.op ?? defaultOp}
              onChange={(event) => onChange({
                op: event.target.value as FilterOp,
                value: filter?.value ?? '',
                selectedValues: filter?.selectedValues,
              })}
            >
              {ops.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
            </select>
            <input
              className={styles.textInput}
              type={type === 'number' ? 'number' : type === 'date' ? 'datetime-local' : 'text'}
              placeholder={type === 'date' ? 'Pick date and time...' : 'Value...'}
              autoFocus
              aria-label={`Filter ${columnName} value`}
              value={filter?.value ?? ''}
              onChange={(event) => onChange({
                op: filter?.op ?? defaultOp,
                value: event.target.value,
                selectedValues: filter?.selectedValues,
              })}
            />
            <button className={styles.filterClear} onClick={onClear} aria-label={`Clear ${columnName} filter`}>
              <IconX size={12} />
            </button>
          </div>

          {type === 'text' && uniqueValues.length > 0 && (
            <div className={styles.valueSection}>
              <div className={styles.valueSectionHeader}>
                <span className={styles.valueSectionTitle}>Values</span>
                <button className={styles.valueAction} onClick={selectAllValues}>Select all</button>
              </div>
              <input
                className={styles.valueSearchInput}
                placeholder="Filter values..."
                aria-label={`Filter ${columnName} values`}
                value={valueSearch}
                onChange={(event) => setValueSearch(event.target.value)}
              />
              <div className={styles.valueList}>
                {filteredValues.length > 0 ? filteredValues.map((value) => {
                  const checked = filter?.selectedValues ? filter.selectedValues.includes(value) : true;
                  return (
                    <label key={value || '__empty__'} className={styles.valueItem}>
                      <input
                        className={styles.valueCheckbox}
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleValue(value)}
                      />
                      <span className={styles.valueLabel}>{value || '(empty)'}</span>
                    </label>
                  );
                }) : <div className={styles.emptyMessage}>No matching values</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};