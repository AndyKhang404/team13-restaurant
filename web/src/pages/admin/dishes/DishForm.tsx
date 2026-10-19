import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { chefsApi, dishesApi, ingredientsApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { ApiError, HttpError, type ApiFieldErrors } from '../../../lib/api';
import { ErrorState, Loading, NotFoundState } from '../../../components/StateViews';
import { FieldError, FormError } from '../../../components/FieldError';
import { CATEGORIES, categoryLabel } from '../../../lib/types';
import type { Chef, DishInput, Ingredient } from '../../../lib/types';

interface RowForm {
  ingredientId: string;
  quantity: string;
  unit: string;
}

const EMPTY = {
  name: '',
  slug: '',
  description: '',
  price: '',
  category: 'main',
  prepTimeMinutes: '',
  chefId: '',
  isAvailable: true,
  isFeatured: false,
};

export default function DishForm({ mode }: { mode: 'new' | 'edit' }) {
  const { id } = useParams<{ id: string }>();
  const editing = mode === 'edit';
  const navigate = useNavigate();

  const deps = useApi(() => Promise.all([chefsApi.list(), ingredientsApi.list()]), []);
  const dishState = useApi(
    () => (editing ? dishesApi.get(id ?? '') : Promise.resolve(null)),
    [editing, id],
  );

  const [form, setForm] = useState({ ...EMPTY });
  const [rows, setRows] = useState<RowForm[]>([]);
  const [errors, setErrors] = useState<ApiFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const currentImageUrl = dishState.data?.imageUrl ?? null;

  const chefs: Chef[] = deps.data?.[0] ?? [];
  const ingredients: Ingredient[] = deps.data?.[1] ?? [];

  useEffect(() => {
    const dish = dishState.data;
    if (!dish) return;
    setForm({
      name: dish.name,
      slug: dish.slug,
      description: dish.description ?? '',
      price: String(dish.price),
      category: dish.category,
      prepTimeMinutes: dish.prepTimeMinutes != null ? String(dish.prepTimeMinutes) : '',
      chefId: dish.chefId ?? '',
      isAvailable: dish.isAvailable,
      isFeatured: dish.isFeatured,
    });
    setRows(
      dish.ingredients.map((line) => ({
        ingredientId: line.ingredientId,
        quantity: String(line.quantity),
        unit: line.unit ?? 'g',
      })),
    );
  }, [dishState.data]);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addRow() {
    setRows((r) => [...r, { ingredientId: '', quantity: '', unit: 'g' }]);
  }

  function updateRow(index: number, patch: Partial<RowForm>) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((r) => r.filter((_, i) => i !== index));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);

    const payload: DishInput = {
      name: form.name,
      slug: form.slug.trim() || undefined,
      description: form.description.trim() || undefined,
      price: Number(form.price),
      category: form.category,
      isAvailable: form.isAvailable,
      isFeatured: form.isFeatured,
      prepTimeMinutes: form.prepTimeMinutes.trim() === '' ? undefined : Number(form.prepTimeMinutes),
      chefId: form.chefId || undefined,
      ingredients: rows
        .filter((r) => r.ingredientId && Number(r.quantity) > 0)
        .map((r) => ({
          ingredientId: r.ingredientId,
          quantity: Number(r.quantity),
          unit: r.unit.trim() || 'g',
        })),
    };

    try {
      if (editing) {
        await dishesApi.update(id ?? '', payload, imageFile, removeImage);
      } else {
        await dishesApi.create(payload, imageFile);
      }
      navigate('/admin/dishes');
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

  if (deps.loading || (editing && dishState.loading)) return <Loading />;
  if (deps.error) return <ErrorState error={deps.error} onRetry={deps.reload} />;
  if (editing && dishState.error) {
    if (dishState.error instanceof ApiError && dishState.error.code === 'NOT_FOUND') {
      return (
        <NotFoundState title="Không tìm thấy món" message="Món ăn này không tồn tại.">
          <Link className="btn btn-solid" to="/admin/dishes">
            Về danh sách
          </Link>
        </NotFoundState>
      );
    }
    return <ErrorState error={dishState.error} onRetry={dishState.reload} />;
  }

  return (
    <section className="panel form-card">
      <div className="panel-head">
        <h2>{editing ? `Sửa món: ${form.name}` : 'Thêm món ăn mới'}</h2>
        <div className="panel-tools">
          <Link className="link-quiet" to="/admin/dishes">
            ← Danh sách món
          </Link>
        </div>
      </div>

      <FormError message={formError} />

      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="field full">
            <p className="form-note">
              Điền thông tin món ăn, chọn danh mục và ghép nguyên liệu theo công thức.
            </p>
          </div>

          <div className="field">
            <label htmlFor="name">
              Tên món <span className="req">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              maxLength={120}
              placeholder="VD: Phở bò tái lăn"
            />
            <FieldError message={errors['name']} />
          </div>

          <div className="field">
            <label htmlFor="slug">URL slug</label>
            <input
              id="slug"
              type="text"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value)}
              maxLength={120}
              placeholder="pho-bo-tai-lan"
            />
            <FieldError message={errors['slug']} />
            <p className="hint">Để trống sẽ tự sinh từ tên món.</p>
          </div>

          <div className="field full">
            <label htmlFor="description">Mô tả</label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Mô tả ngắn về món ăn, nguồn gốc hoặc hương vị..."
            />
            <FieldError message={errors['description']} />
          </div>

          <div className="field">
            <label htmlFor="price">
              Giá (VNĐ) <span className="req">*</span>
            </label>
            <input
              id="price"
              type="number"
              step="any"
              min="0"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              required
              placeholder="55000"
            />
            <FieldError message={errors['price']} />
          </div>

          <div className="field">
            <label htmlFor="category">
              Danh mục <span className="req">*</span>
            </label>
            <select
              id="category"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              required
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabel(cat)}
                </option>
              ))}
            </select>
            <FieldError message={errors['category']} />
          </div>

          <div className="field">
            <label htmlFor="prepTimeMinutes">Thời gian chuẩn bị (phút)</label>
            <input
              id="prepTimeMinutes"
              type="number"
              min="1"
              value={form.prepTimeMinutes}
              onChange={(e) => set('prepTimeMinutes', e.target.value)}
              placeholder="15"
            />
            <FieldError message={errors['prepTimeMinutes']} />
          </div>

          <div className="field">
            <label htmlFor="chefId">Đầu bếp phụ trách</label>
            <select
              id="chefId"
              value={form.chefId}
              onChange={(e) => set('chefId', e.target.value)}
            >
              <option value="">Chưa phân công</option>
              {chefs.map((chef) => (
                <option key={chef.id} value={chef.id}>
                  {chef.name}
                  {chef.specialty ? ` · ${chef.specialty}` : ''}
                </option>
              ))}
            </select>
            <FieldError message={errors['chefId']} />
          </div>

          <div className="field full">
            <label htmlFor="image">Ảnh món ăn (JPG, PNG hoặc WebP, tối đa 2MB)</label>
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
                Còn bán
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.isFeatured}
                  onChange={(e) => set('isFeatured', e.target.checked)}
                />{' '}
                Nổi bật ở trang chủ
              </label>
            </div>
          </div>

          <div className="field full">
            <div className="ing-head">
              <div>
                <label>Nguyên liệu &amp; định lượng</label>
                <p className="hint">Nguyên liệu theo công thức của món.</p>
              </div>
              <button type="button" className="btn btn-quiet btn-sm" onClick={addRow}>
                + Thêm dòng
              </button>
            </div>
            <FieldError message={errors['ingredients']} />
            <div className="ing-rows">
              {rows.map((row, index) => (
                <div className="ing-row" key={index}>
                  <select
                    className="ing-sel"
                    value={row.ingredientId}
                    onChange={(e) => updateRow(index, { ingredientId: e.target.value })}
                    required
                  >
                    <option value="">Chọn nguyên liệu</option>
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} ({ing.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    className="ing-qty"
                    type="number"
                    step="any"
                    min="0.01"
                    placeholder="SL"
                    value={row.quantity}
                    onChange={(e) => updateRow(index, { quantity: e.target.value })}
                    required
                  />
                  <input
                    className="ing-unit"
                    type="text"
                    maxLength={30}
                    placeholder="ĐVT"
                    value={row.unit}
                    onChange={(e) => updateRow(index, { unit: e.target.value })}
                  />
                  <button
                    type="button"
                    className="remove-row-btn"
                    title="Xóa dòng"
                    onClick={() => removeRow(index)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="form-foot">
          <span className="left">Trường có dấu * là bắt buộc</span>
          <Link className="btn btn-quiet" to="/admin/dishes">
            Hủy
          </Link>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo món'}
          </button>
        </div>
      </form>
    </section>
  );
}
