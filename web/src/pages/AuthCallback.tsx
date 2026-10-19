import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/resources';
import { useAuth } from '../auth/AuthProvider';
import { canAccessAdmin } from '../auth/roles';
import { FormError } from '../components/FieldError';
import { Loading } from '../components/StateViews';

/**
 * Landing page for email confirmation / magic links. Supabase redirects here
 * with `?code=` or `?token_hash=&type=`; we forward it to the API, which
 * exchanges it for a cookie session.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    authApi
      .callback(`?${params.toString()}`)
      .then(async (result) => {
        if (!alive) return;
        await refresh();
        const target = canAccessAdmin(result.user) ? (result.redirectTo ?? '/admin') : '/';
        navigate(target, { replace: true });
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Liên kết không hợp lệ.');
      });
    return () => {
      alive = false;
    };
  }, [navigate, params, refresh]);

  if (error) {
    return (
      <div className="empty" style={{ marginTop: 36 }}>
        <b>Xác nhận thất bại</b>
        <FormError message={error} />
        <div className="actions-row" style={{ justifyContent: 'center', marginTop: 20 }}>
          <Link className="btn btn-solid" to="/login">
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  return <Loading label="Đang xác nhận đăng nhập…" />;
}
