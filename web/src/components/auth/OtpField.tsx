import type { ChangeEvent } from 'react';

export interface OtpFieldProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  label?: string;
  hint?: string;
  placeholder?: string;
}

export function OtpField({
  id = 'otp-input',
  name = 'otp',
  value,
  onChange,
  disabled = false,
  required = true,
  autoFocus = true,
  label = 'Mã xác nhận OTP',
  hint = 'Nhập mã gồm 6 chữ số được gửi tới hộp thư của bạn (kiểm tra cả mục Spam).',
  placeholder = '123456',
}: OtpFieldProps) {
  const hintId = `${id}-hint`;

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value.replace(/\D/g, '').slice(0, 6));
  }

  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {required && <span className="req">*</span>}
      </label>
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      <input
        id={id}
        name={name}
        className="otp-input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        minLength={6}
        maxLength={6}
        aria-describedby={hint ? hintId : undefined}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        value={value}
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}
