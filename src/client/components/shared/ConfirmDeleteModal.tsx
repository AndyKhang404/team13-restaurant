import React, { useEffect, useRef } from 'react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  itemName: string;
  itemType?: string;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  title,
  itemName,
  itemType = 'bản ghi',
  isDeleting = false,
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="chef-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onCancel();
        }
      }}
      style={{ padding: 0, border: 'none', background: 'transparent' }}
    >
      <div className="panel form-card" style={{ maxWidth: '480px', margin: 'auto' }}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="chef-dialog-close"
            style={{ position: 'relative', top: 'auto', right: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px' }}
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        <div className="form-grid" style={{ padding: '24px 20px' }}>
          <div className="field full">
            <p className="form-note" style={{ margin: 0, fontSize: '15px' }}>
              Bạn có chắc muốn xóa {itemType} <b>{itemName}</b>?
              <br />
              Dữ liệu sẽ được chuyển vào danh sách đã xóa và có thể khôi phục sau.
            </p>
          </div>
        </div>

        <div className="form-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Hủy
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
          </button>
        </div>
      </div>
    </dialog>
  );
};
