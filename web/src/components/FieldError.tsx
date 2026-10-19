export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="err">{message}</span>;
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="alert error">
      <b>Lỗi</b>
      <span>{message}</span>
    </div>
  );
}
