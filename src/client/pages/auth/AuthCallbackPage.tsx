import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.js';
import { useFlash } from '../../context/FlashContext.js';

export const AuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();
  const { setFlash } = useFlash();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type');
    const next = searchParams.get('next');

    if (!code && !tokenHash) {
      setErrorMsg('Thiếu mã xác nhận tài khoản.');
      return;
    }

    apiFetch<{ redirectTo: string; message: string }>('/auth/callback', {
      method: 'POST',
      body: {
        code: code || undefined,
        token_hash: tokenHash || undefined,
        type: type || undefined,
        next: next || undefined,
      },
    })
      .then(async (res) => {
        await refreshAuth();
        setFlash({ type: 'success', message: res.message || 'Xác nhận email thành công!' });
        navigate(res.redirectTo || '/');
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setErrorMsg(err.message);
        } else {
          setErrorMsg('Liên kết xác nhận không hợp lệ hoặc đã hết hạn.');
        }
      });
  }, [searchParams, navigate, refreshAuth, setFlash]);

  if (errorMsg) {
    return (
      <div className="error-page" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <div className="code">Lỗi</div>
        <h1>Xác nhận không thành công</h1>
        <p>{errorMsg}</p>
        <div className="actions-row" style={{ justifyContent: 'center', marginTop: '20px' }}>
          <Link className="btn btn-solid" to="/login">
            Đến trang đăng nhập
          </Link>
          <Link className="btn" to="/">
            Về trang chủ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '80px 20px', textAlign: 'center', fontFamily: 'var(--mono)' }}>
      Đang xác thực liên kết của bạn...
    </div>
  );
};
