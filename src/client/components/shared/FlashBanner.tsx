import React from 'react';
import { useFlash } from '../../context/FlashContext.js';

export const FlashBanner: React.FC = () => {
  const { flash, clearFlash } = useFlash();

  if (!flash) return null;

  const isError = flash.type === 'error';
  const isInfo = flash.type === 'info';
  const label = isError ? 'Lỗi' : isInfo ? 'Thông tin' : 'Thành công';

  return (
    <div
      className={`alert ${isError ? 'error' : isInfo ? 'info' : ''}`.trim()}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
    >
      <div>
        <b>{label}</b> <span>{flash.message}</span>
      </div>
      <button
        type="button"
        onClick={clearFlash}
        style={{
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: '18px',
          padding: '0 8px',
          lineHeight: '1',
        }}
        aria-label="Đóng thông báo"
      >
        ×
      </button>
    </div>
  );
};
