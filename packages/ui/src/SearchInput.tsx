import * as React from 'react';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onValueChange: (next: string) => void;
  label?: string;
  placeholder?: string;
}

/**
 * A small, accessible search input. Renders a wrapper <label> when `label`
 * is provided so screen readers can announce it.
 */
export function SearchInput({
  value,
  onValueChange,
  label,
  placeholder = 'Search…',
  className = '',
  ...rest
}: SearchInputProps) {
  const inputId = React.useId();
  const input = (
    <input
      id={inputId}
      type="search"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onValueChange(e.target.value)}
      className={
        'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ' +
        'placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none ' +
        'focus:ring-2 focus:ring-emerald-200 ' +
        className
      }
      {...rest}
    />
  );

  if (!label) return input;

  return (
    <label htmlFor={inputId} className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {input}
    </label>
  );
}
