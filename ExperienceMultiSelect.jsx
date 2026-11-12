import React, { useEffect, useRef, useState } from 'react';
import './ExperienceMultiSelect.css';

// Standalone picker: callers supply labels and opaque IDs, without host-specific dependencies.
export function ExperienceMultiSelect({ id, label, options, value, onChange, disabled = false,
  emptyLabel = 'No EXPERIENCE available', noMatchesLabel = 'No matching experiences.',
  unavailableLabel = 'Unavailable EXPERIENCE', removeLabel = (title) => `Remove ${title}`,
  entityPreview = false, onDismiss = () => {} }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const input = useRef(null);
  const focusFirst = useRef(false);
  const suppressFocusOpen = useRef(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const normalized = query.trim().toLocaleLowerCase();
  const matches = options.filter((option) => option.label.toLocaleLowerCase().includes(normalized));
  const selected = value.map((selectedId) => options.find((option) => option.id === selectedId)
    || { id: selectedId, label: unavailableLabel });
  useEffect(() => {
    dismissRef.current();
    return () => dismissRef.current();
  }, [query, open, options]);
  useEffect(() => {
    if (open && focusFirst.current) {
      focusFirst.current = false;
      root.current?.querySelector('[role="option"]')?.focus();
    }
  }, [open]);
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
        input.current?.focus();
        suppressFocusOpen.current = false;
      }
    }}>
      <label htmlFor={id}>{label}</label>
      <div className="experience-multi-field" onClick={() => input.current?.focus()}>
        {selected.map((option) => (
          <span className="badge experience-multi-badge" key={option.id}>
            <span>{option.label}</span>
            <button type="button" disabled={disabled} aria-label={removeLabel(option.label)}
              onClick={(event) => { event.stopPropagation(); onChange(value.filter((item) => item !== option.id)); }}>×</button>
          </span>
        ))}
        <input ref={input} id={id} role="combobox" aria-expanded={open}
          aria-controls={`${id}-choices`} aria-autocomplete="list" aria-haspopup="listbox"
          disabled={disabled || (!options.length && !value.length)} value={query}
          placeholder={!options.length ? emptyLabel : undefined}
          onFocus={() => { if (!suppressFocusOpen.current) setOpen(true); }}
          onClick={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (open) focusOption(0);
              else { focusFirst.current = true; setOpen(true); }
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              if (open && matches.length) select(matches[0]);
              else setOpen(true);
            }
          }} />
      </div>
      {open && <div id={`${id}-choices`} className="experience-multi-menu" role="listbox"
        aria-label={label} aria-multiselectable="true">
        {!matches.length && <div className="experience-multi-empty" role="status">{options.length ? noMatchesLabel : emptyLabel}</div>}
        {matches.map((option, index) => (
          <button type="button" role="option" key={option.id} aria-selected={value.includes(option.id)}
            data-entity-type={entityPreview ? 'EXPERIENCE' : undefined}
            data-entity-id={entityPreview ? option.id : undefined}
            onClick={() => select(option)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                focusOption(index + (event.key === 'ArrowDown' ? 1 : -1));
              }
            }}>{option.label}</button>
        ))}
      </div>}
    </div>
  );
}
