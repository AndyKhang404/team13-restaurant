import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ingredientsApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { ApiError, HttpError, type ApiFieldErrors } from '../../../lib/api';
import { ErrorState, Loading, NotFoundState } from '../../../components/StateViews';
import { FieldError, FormError } from '../../../components/FieldError';
import type { IngredientInput } from '../../../lib/types';

const EMPTY = {
  name: '',
  unit: 'g',
  stockQuantity: '0',
  pricePerUnit: '0',
  isAvailable: true,
};

export default function IngredientForm({ mode }: { mode: 'new' | 'edit' }) {
  const { id } = useParams<{ id: string }>();
  const editing = mode === 'edit';
  const navigate = useNavigate();

  const ingState = useApi(
    () => (editing ? ingredientsApi.get(id ?? '') : Promise.resolve(null)),
    [editing, id],
  );

  const [form, setForm] = useState({ ...EMPTY });
  const [errors, setErrors] = useState<ApiFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const currentImageUrl = ingState.data?.imageUrl ?? null;

  useEffect(() => {
    const ing = ingState.data;
    if (!ing) return;
    setForm({
      name: ing.name,
      unit: ing.unit,
      stockQuantity: String(ing.stockQuantity),
      pricePerUnit: String(ing.pricePerUnit),
      isAvailable: ing.isAvailable,
    });
  }, [ingState.data]);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrors({});
    setFormError(null);

    const payload: IngredientInput = {
      name: form.name,
      unit: form.unit,
      stockQuantity: Number(form.stockQuantity) || 0,
      pricePerUnit: Number(form.pricePerUnit) || 0,
      isAvailable: form.isAvailable,
    };

    try {
      if (editing) {
        await ingredientsApi.update(id ?? '', payload, imageFile, removeImage);
      } else {
        await ingredientsApi.create(payload, imageFile);
      }
      navigate('/admin/ingredients');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {});
        if (!err.fields || Object.keys(err.fields).length === 0) setFormError(err.message);
      } else if (err instanceof HttpError) {
        setFormError(err.message);
      } else {
        setFormError('Lỗi không xác định.');
      }
      setSaving(false);
    }
  }

  if (editing && ingState.loading) return <Loading />;
  if (editing && ingState.error) {
    if (ingState.error instanceof ApiError && ingState.error.code === 'NOT_FOUND') {
      return (
        <NotFoundState title="Không tìm thấy nguyên liệu" message="Nguyên liệu này không tồn tại.">
          <Link className="btn btn-solid" to="/admin/ingredients">
            Về kho nguyên liệu
          </Link>
        </NotFoundState>
      );
    }
    return <ErrorState error={ingState.error} onRetry={ingState.reload} />;
  }

  return (
    <section className="panel form-card">
      <div className="panel-head">
        <h2>{editing ? `Sửa nguyên liệu: ${form.name}` : 'Thêm nguyên liệu mới'}</h2>
        <div className="panel-tools">
          <Link className="link-quiet" to="/admin/ingredients">
            ← Kho nguyên liệu
          </Link>
        </div>
      </div>

      <FormError message={formError} />

      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="field full">
            <p className="form-note">Quản lý tồn kho và giá vốn cho từng nguyên liệu.</p>
          </div>

          <div className="field">
            <label htmlFor="name">
              Tên nguyên liệu <span className="req">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              maxLength={120}
              placeholder="VD: Thịt bò tái, cà chua"
            />
            <FieldError message={errors['name']} />
          </div>

          <div className="field">
            <label htmlFor="unit">
              Đơn vị tính <span className="req">*</span>
            </label>
            <input
              id="unit"
              type="text"
              value={form.unit}
              onChange={(e) => set('unit', e.target.value)}
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
            <FieldError message={errors['unit']} />
          </div>

          <div className="field">
            <label htmlFor="stockQuantity">Số lượng tồn</label>
            <input
              id="stockQuantity"
              type="number"
              step="any"
              min="0"
              value={form.stockQuantity}
              onChange={(e) => set('stockQuantity', e.target.value)}
              placeholder="1000"
            />
            <FieldError message={errors['stockQuantity']} />
          </div>

          <div className="field">
            <label htmlFor="pricePerUnit">Giá vốn / đơn vị (VNĐ)</label>
            <input
              id="pricePerUnit"
              type="number"
              step="any"
              min="0"
              value={form.pricePerUnit}
              onChange={(e) => set('pricePerUnit', e.target.value)}
              placeholder="250"
            />
            <FieldError message={errors['pricePerUnit']} />
          </div>

          <div className="field full">
            <label htmlFor="image">Ảnh nguyên liệu (JPG, PNG hoặc WebP, tối đa 2MB)</label>
            {imageFile ? (
              <img className="img-preview" src={URL.createObjectURL(imageFile)} alt="Ảnh mới" />
            ) : currentImageUrl && !removeImage ? (
              <img className="img-preview" src={currentImageUrl} alt="Ảnh hiện tại" />
            ) : null}
            <input
              id="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setImageFile(e.target.files?.[0] ?? null);
                setRemoveImage(false);
              }}
            />
            <FieldError message={errors['image']} />
            {currentImageUrl ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={removeImage}
                  onChange={(e) => {
                    setRemoveImage(e.target.checked);
                    if (e.target.checked) setImageFile(null);
                  }}
                />{' '}
                Xoá ảnh hiện tại
              </label>
            ) : null}
          </div>

          <div className="field full">
            <div className="check-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.isAvailable}
                  onChange={(e) => set('isAvailable', e.target.checked)}
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
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo nguyên liệu'}
          </button>
        </div>
      </form>
    </section>
  );
}
