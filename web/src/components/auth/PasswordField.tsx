import { useState, type ChangeEvent } from 'react';

export function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6.5 10-6.5c2 0 3.7.55 5.2 1.4M22 12s-3.5 6.5-10 6.5c-2 0-3.7-.55-5.2-1.4" />
      <path d="M4 4l16 16" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

export interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  className?: string;
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  autoComplete,
  placeholder,
  minLength,
  maxLength,
  className = '',
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  return (
    <div className={`field field-with-eye ${className}`.trim()}>
      <label htmlFor={id}>
        {label} {required && <span className="req">*</span>}
      </label>
      <div className="eye-box">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          disabled={disabled}
        />
        <button
          type="button"
          className="field-eye"
          aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={show}
          onClick={() => setShow((v) => !v)}
          disabled={disabled}
        >
          <EyeIcon open={show} />
        </button>
      </div>
    </div>
  );
}
