import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../../../lib/api.js';
import { useFlash } from '../../../context/FlashContext.js';

interface IngredientRecord {
  id: string;
  name: string;
  unit: string;
  stockQuantity?: number | string | null;
  pricePerUnit?: number | string | null;
  isAvailable?: boolean | null;
  imageUrl?: string | null;
}

export const IngredientFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { setFlash } = useFlash();

  const [loading, setLoading] = useState(!isNew);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('g');
  const [stockQuantity, setStockQuantity] = useState<number | string>(0);
  const [pricePerUnit, setPricePerUnit] = useState<number | string>(0);
  const [isAvailable, setIsAvailable] = useState(true);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isNew) {
      apiFetch<{ ingredient: IngredientRecord }>(`/admin/ingredients/${id}`)
        .then((res) => {
          const ing = res.ingredient;
          setName(ing.name || '');
          setUnit(ing.unit || 'g');
          setStockQuantity(ing.stockQuantity ?? 0);
          setPricePerUnit(ing.pricePerUnit ?? 0);
          setIsAvailable(Boolean(ing.isAvailable));
          setExistingImageUrl(ing.imageUrl || null);
        })
        .catch((err) => {
          console.error(err);
          setFlash({ type: 'error', message: 'Không tìm thấy nguyên liệu.' });
          navigate('/admin/ingredients');
        })
        .finally(() => setLoading(false));
    }
  }, [id, isNew, navigate, setFlash]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);

    const formData = new FormData();
    formData.append('name', name);
    formData.append('unit', unit);
    formData.append('stockQuantity', String(stockQuantity));
    formData.append('pricePerUnit', String(pricePerUnit));
    if (isAvailable) formData.append('isAvailable', 'on');
    if (removeImage) formData.append('removeImage', 'on');
    if (imageFile) formData.append('image', imageFile);

    try {
      const url = isNew ? '/admin/ingredients' : `/admin/ingredients/${id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await apiFetch<{ ingredient: IngredientRecord; message: string }>(url, {
        method,
        body: formData,
      });

      setFlash({ type: 'success', message: res.message || 'Lưu nguyên liệu thành công.' });
      navigate('/admin/ingredients');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) {
          setErrors(err.fields);
        } else {
          setErrors({ _form: err.message });
        }
      } else {
        setErrors({ _form: 'Đã xảy ra lỗi khi lưu nguyên liệu. Thử lại sau.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', fontFamily: 'var(--mono)' }}>
        Đang tải thông tin nguyên liệu...
      </div>
    );
  }

  return (
    <section className="panel form-card">
      <div className="panel-head">
        <h2>{isNew ? 'Thêm nguyên liệu mới' : `Sửa nguyên liệu: ${name}`}</h2>
        <div className="panel-tools">
          <Link className="link-quiet" to="/admin/ingredients">
            ← Kho nguyên liệu
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field full">
            <p className="form-note">Quản lý tồn kho và giá vốn cho từng nguyên liệu.</p>
            {errors['_form'] ? <p className="err">{errors['_form']}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="name">
              Tên nguyên liệu <span className="req">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="VD: Thịt bò tái, cà chua"
            />
            {errors['name'] ? <p className="err">{errors['name']}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="unit">
              Đơn vị tính <span className="req">*</span>
            </label>
            <input
              type="text"
              id="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              required
              maxLength={30}
              list="unit-suggestions"
              placeholder="g, kg, ml, lít, cái"
            />
            <datalist id="unit-suggestions">
              <option value="g" />
              <option value="kg" />
              <option value="ml" />
              <option value="lít" />
              <option value="cái" />
              <option value="gói" />
              <option value="miếng" />
            </datalist>
            {errors['unit'] ? <p className="err">{errors['unit']}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="stockQuantity">Số lượng tồn</label>
            <input
              type="number"
              step="any"
              id="stockQuantity"
              min="0"
              value={stockQuantity}
              onChange={(e) => setStockQuantity(e.target.value)}
              placeholder="1000"
            />
            {errors['stockQuantity'] ? (
              <p className="err">{errors['stockQuantity']}</p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="pricePerUnit">Giá vốn / đơn vị (VNĐ)</label>
            <input
              type="number"
              step="any"
              id="pricePerUnit"
              min="0"
              value={pricePerUnit}
              onChange={(e) => setPricePerUnit(e.target.value)}
              placeholder="250"
            />
            {errors['pricePerUnit'] ? (
              <p className="err">{errors['pricePerUnit']}</p>
            ) : null}
          </div>

          <div className="field full">
            <label htmlFor="image">Ảnh nguyên liệu</label>
            {existingImageUrl ? (
              <div className={`form-photo ${removeImage ? 'is-removed' : ''}`.trim()}>
                <img className="img-preview" src={existingImageUrl} alt="Ảnh hiện tại" />
                <div className="photo-controls">
                  <button
                    type="button"
                    className={`btn btn-sm ${removeImage ? 'btn-quiet' : 'btn-danger'}`.trim()}
                    onClick={() => setRemoveImage((prev) => !prev)}
                    aria-pressed={removeImage}
                  >
                    <span className="remove-photo-btn-text">
                      {removeImage ? 'Hoàn tác gỡ ảnh' : 'Gỡ ảnh hiện tại'}
                    </span>
                  </button>
                  {removeImage ? (
                    <span className="photo-remove-note" aria-live="polite">
                      Đã chọn gỡ ảnh (sẽ xóa khi lưu)
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            <input
              type="file"
              id="image"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setImageFile(f || null);
              }}
            />
            {errors['image'] ? <p className="err">{errors['image']}</p> : null}
            <p className="hint">JPG, PNG hoặc WebP · tối đa 2 MB.</p>
          </div>

          <div className="field full">
            <div className="check-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={isAvailable}
                  onChange={(e) => setIsAvailable(e.target.checked)}
                />{' '}
                Còn dùng cho công thức
              </label>
            </div>
          </div>
        </div>

        <div className="form-foot">
          <span className="left">Trường có dấu * là bắt buộc</span>
          <Link className="btn btn-quiet" to="/admin/ingredients">
            Hủy
          </Link>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Đang lưu...' : isNew ? 'Tạo nguyên liệu' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </section>
  );
};
