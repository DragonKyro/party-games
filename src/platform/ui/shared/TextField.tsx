import type { InputHTMLAttributes } from 'react';
import './TextField.css';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function TextField({ label, className = '', id, ...rest }: Props) {
  const inputId = id ?? `tf-${rest.name ?? Math.random().toString(36).slice(2)}`;
  return (
    <label className={`pg-tf ${className}`} htmlFor={inputId}>
      {label != null && <span className="pg-tf-label">{label}</span>}
      <input id={inputId} className="pg-tf-input" {...rest} />
    </label>
  );
}
