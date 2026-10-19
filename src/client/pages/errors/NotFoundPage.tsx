import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="error-page" style={{ padding: '80px 20px', textAlign: 'center' }}>
      <div className="code">404</div>
      <h1>Không tìm thấy trang</h1>
      <p>Trang hoặc món bạn tìm không tồn tại, có thể đã được gỡ khỏi thực đơn.</p>
      <div className="actions-row" style={{ justifyContent: 'center', marginTop: '20px' }}>
        <Link className="btn btn-solid" to="/">
          Về trang chủ
        </Link>
        <Link className="btn" to="/menu">
          Xem thực đơn
        </Link>
      </div>
    </div>
  );
};
