import React, { useEffect, useRef, useState } from 'react';
import './ExperienceMultiSelect.css';

// Standalone picker: callers supply labels and opaque IDs, without host-specific dependencies.
export function ExperienceMultiSelect({ id, label, options, value, onChange, disabled = false,
  emptyLabel = 'No EXPERIENCE available', noMatchesLabel = 'No matching experiences.',
  unavailableLabel = 'Unavailable EXPERIENCE', removeLabel = (title) => `Remove ${title}`,
  placeholder = 'Select EXPERIENCES', searchLabel = `Search ${label}`,
  searchPlaceholder = 'Search experiences', searchValue, onSearchChange,
  entityPreview = false, entityType = 'EXPERIENCE', onDismiss = () => {} }) {
  const [draftQuery, setDraftQuery] = useState('');
  const query = searchValue ?? draftQuery;
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const search = useRef(null);
  const suppressFocusOpen = useRef(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const normalized = query.trim().toLocaleLowerCase();
  const matches = options.filter((option) => option.label.toLocaleLowerCase().includes(normalized));
  const selected = value.map((selectedId) => options.find((option) => option.id === selectedId)
    || { id: selectedId, label: unavailableLabel });
  const unavailable = disabled || (!options.length && !value.length);
  useEffect(() => {
    dismissRef.current();
    return () => dismissRef.current();
  }, [query, open, options]);
  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);
  useEffect(() => { if (unavailable) setOpen(false); }, [unavailable]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!root.current?.contains(event.target) && !event.target.closest?.('.entity-info-preview')) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const focusOption = (index) => {
    const items = root.current?.querySelectorAll('[role="option"]');
    if (items?.length) items[(index + items.length) % items.length].focus();
  };
  const select = (option) => {
    onChange(value.includes(option.id) ? value.filter((idValue) => idValue !== option.id) : [...value, option.id]);
  };
  return (
    <div className="experience-multi" ref={root} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current();
        setOpen(false);
        suppressFocusOpen.current = true;
        trigger.current?.focus();
        suppressFocusOpen.current = false;
      }
    }}>
      <label htmlFor={id}>{label}</label>
      <div className="experience-multi-field" onClick={() => {
        if (!unavailable) { setOpen(true); search.current?.focus(); }
      }}>
        {selected.map((option) => (
          <span className="badge experience-multi-badge" key={option.id}>
            <span>{option.label}</span>
            <button type="button" disabled={disabled} aria-label={removeLabel(option.label)}
              onClick={(event) => { event.stopPropagation(); onChange(value.filter((item) => item !== option.id)); }}>×</button>
          </span>
        ))}
        <button ref={trigger} id={id} type="button" role="combobox" aria-expanded={open}
          aria-label={label} aria-controls={`${id}-choices`} aria-haspopup="listbox"
          className="experience-multi-trigger" disabled={unavailable}
          onFocus={() => { if (!suppressFocusOpen.current) setOpen(true); }}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              search.current?.focus();
            }
          }}>
          {!options.length ? emptyLabel : !selected.length ? placeholder : null}
        </button>
      </div>
      {open && <div className="experience-multi-menu">
        <div className="experience-multi-search">
          <input ref={search} type="search" aria-label={searchLabel}
            aria-controls={`${id}-choices`} placeholder={searchPlaceholder} value={query}
            onChange={(event) => {
              if (onSearchChange) onSearchChange(event.target.value);
              else setDraftQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                focusOption(0);
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                if (matches.length) select(matches[0]);
              }
            }} />
        </div>
        <div id={`${id}-choices`} className="experience-multi-choices" role="listbox"
          aria-label={label} aria-multiselectable="true">
          {!matches.length && <div className="experience-multi-empty" role="status">{options.length ? noMatchesLabel : emptyLabel}</div>}
          {matches.map((option, index) => (
            <button type="button" role="option" key={option.id} aria-selected={value.includes(option.id)}
              data-entity-type={entityPreview ? entityType : undefined}
              data-entity-id={entityPreview ? option.id : undefined}
              onClick={() => select(option)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  focusOption(index + (event.key === 'ArrowDown' ? 1 : -1));
                }
              }}>{option.label}</button>
          ))}
        </div>
      </div>}
    </div>
  );
}
