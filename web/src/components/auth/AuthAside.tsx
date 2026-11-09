interface AuthAsideProps {
  quote: string;
  eyebrow?: string;
}

export function AuthAside({ quote, eyebrow = 'Team13 Restaurant' }: AuthAsideProps) {
  return (
    <div className="auth-aside">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <p className="auth-quote">{quote}</p>
      </div>
      <div className="auth-aside-foot">
        <span>123 Nguyễn Văn Cừ, Q.5, TP.HCM</span>
        <span>Mở cửa 09:00 – 22:00</span>
        <span>1900 6868</span>
      </div>
    </div>
  );
}
