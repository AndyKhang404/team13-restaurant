import React from 'react';

export const SkeletonOverlay: React.FC = () => {
  return (
    <div className="skeleton-overlay" aria-hidden="true">
      <div className="skel-grid">
        <div className="sk-card">
          <div className="sk-media"><div className="sk"></div></div>
          <div className="sk-body">
            <div className="sk-meta"><div className="sk"></div><div className="sk"></div></div>
            <div className="sk sk-title" style={{ width: '88%' }}></div>
            <div className="sk sk-sub" style={{ width: '62%' }}></div>
            <div className="sk-foot"><div className="sk"></div><div className="sk"></div></div>
          </div>
        </div>
        <div className="sk-card">
          <div className="sk-media"><div className="sk"></div></div>
          <div className="sk-body">
            <div className="sk-meta"><div className="sk"></div><div className="sk"></div></div>
            <div className="sk sk-title" style={{ width: '74%' }}></div>
            <div className="sk sk-sub" style={{ width: '85%' }}></div>
            <div className="sk-foot"><div className="sk"></div><div className="sk"></div></div>
          </div>
        </div>
        <div className="sk-card">
          <div className="sk-media"><div className="sk"></div></div>
          <div className="sk-body">
            <div className="sk-meta"><div className="sk"></div><div className="sk"></div></div>
            <div className="sk sk-title" style={{ width: '80%' }}></div>
            <div className="sk sk-sub" style={{ width: '55%' }}></div>
            <div className="sk-foot"><div className="sk"></div><div className="sk"></div></div>
          </div>
        </div>
      </div>
    </div>
  );
};
