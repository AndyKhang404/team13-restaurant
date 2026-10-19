import React from 'react';
import { Link } from 'react-router-dom';

interface ServerErrorPageProps {
  message?: string;
}

export const ServerErrorPage: React.FC<ServerErrorPageProps> = ({ message }) => {
  return (
    <div className="error-page" style={{ padding: '80px 20px', textAlign: 'center' }}>
      <div className="code">500</div>
      <h1>Lỗi máy chủ</h1>
      <p>{message || 'Đã xảy ra lỗi khi xử lý yêu cầu của bạn, thử lại sau ít phút.'}</p>
      <div className="actions-row" style={{ justifyContent: 'center', marginTop: '26px' }}>
        <Link className="btn btn-solid" to="/">
          Về trang chủ
        </Link>
      </div>
    </div>
  );
};
