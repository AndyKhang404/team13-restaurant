import React from 'react';
import { Link } from 'react-router-dom';

export const ForbiddenPage: React.FC = () => {
  return (
    <div className="error-page" style={{ padding: '80px 20px', textAlign: 'center' }}>
      <div className="code">403</div>
      <h1>Không có quyền truy cập</h1>
      <p>Bạn không có quyền thực hiện thao tác này hoặc xem trang này.</p>
      <div className="actions-row" style={{ justifyContent: 'center', marginTop: '20px' }}>
        <Link className="btn btn-solid" to="/">
          Về trang chủ
        </Link>
        <Link className="btn" to="/login">
          Đăng nhập
        </Link>
      </div>
    </div>
  );
};
