import React from 'react';
import { Search, X } from 'lucide-react';

interface ProfessionalSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
  inputClassName?: string;
  compact?: boolean;
}

/** Shared, compact search control for searchable lists and tables. */
export const ProfessionalSearchField: React.FC<ProfessionalSearchFieldProps> = ({
  value,
  onChange,
  placeholder,
  label,
  className = '',
  inputClassName = '',
  compact = false,
}) => (
  <label className={`relative block w-full ${className}`}>
    <span className="sr-only">{label || placeholder}</span>
    <Search aria-hidden="true" className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      className={`w-full rounded-xl border border-slate-300 bg-white pr-9 text-right text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${compact ? 'min-h-9 py-1.5 pl-9 text-xs' : 'min-h-10 py-2 pl-10 text-sm'} ${inputClassName}`}
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="مسح البحث"
        title="مسح البحث"
        className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${compact ? 'h-6 w-6' : 'h-7 w-7'}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    )}
  </label>
);
