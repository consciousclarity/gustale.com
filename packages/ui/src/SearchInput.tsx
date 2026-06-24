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
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onValueChange(e.currentTarget.value)}
      className={
        'w-full rounded-md border px-3 py-2 text-sm bg-white ' +
        'placeholder:text-[var(--sub)] focus:outline-none focus:ring-2 ' +
        className
      }
      style={{
        borderColor: 'var(--line)',
        color: 'var(--ink)',
        backgroundColor: 'var(--card)',
        fontFamily: 'var(--body)',
        '--tw-ring-color': 'var(--accent)',
        '--tw-ring-opacity': '1',
      } as React.CSSProperties}
      {...rest}
    />
  );

  if (!label) return input;

  return (
    <label htmlFor={inputId} className="block">
      <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--ink)', fontFamily: 'var(--body)' }}>{label}</span>
      {input}
    </label>
  );
}
