import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../../../lib/api.js';
import { useFlash } from '../../../context/FlashContext.js';

interface ChefOption {
  id: string;
  name: string;
  specialty: string | null;
  isDeleted: boolean;
}

interface IngredientOption {
  id: string;
  name: string;
  unit: string;
  isDeleted: boolean;
}

interface CategoryOption {
  key: string;
  label: string;
}

interface DishRecord {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  price?: number | string | null;
  category?: string | null;
  prepTimeMinutes?: number | null;
  chefId?: string | null;
  isAvailable?: boolean | null;
  isFeatured?: boolean | null;
  imageUrl?: string | null;
}

interface DishIngredientRow {
  ingredientId: string;
  quantity: number | string;
  unit: string;
}

export const DishFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { setFlash } = useFlash();

  const [loading, setLoading] = useState(!isNew);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number | string>('');
  const [category, setCategory] = useState('main');
  const [prepTimeMinutes, setPrepTimeMinutes] = useState<number | string>('');
  const [chefId, setChefId] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Dynamic ingredient rows
  const [ingredientRows, setIngredientRows] = useState<DishIngredientRow[]>([]);

  // Options
  const [chefs, setChefs] = useState<ChefOption[]>([]);
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isNew) {
      apiFetch<{
        chefs: ChefOption[];
        ingredients: IngredientOption[];
        categories: CategoryOption[];
      }>('/admin/dishes/form-deps')
        .then((res) => {
          setChefs(res.chefs);
          setIngredients(res.ingredients);
          setCategories(res.categories);
        })
        .catch((err) => console.error(err));
    } else {
      apiFetch<{
        dish: DishRecord;
        dishIngredients: DishIngredientRow[];
        chefs: ChefOption[];
        ingredients: IngredientOption[];
        categories: CategoryOption[];
      }>(`/admin/dishes/${id}`)
        .then((res) => {
          const d = res.dish;
          setName(d.name || '');
          setSlug(d.slug || '');
          setDescription(d.description || '');
          setPrice(d.price ?? '');
          setCategory(d.category || 'main');
          setPrepTimeMinutes(d.prepTimeMinutes ?? '');
          setChefId(d.chefId || '');
          setIsAvailable(Boolean(d.isAvailable));
          setIsFeatured(Boolean(d.isFeatured));
          setExistingImageUrl(d.imageUrl || null);
          setIngredientRows(res.dishIngredients || []);
          setChefs(res.chefs);
          setIngredients(res.ingredients);
          setCategories(res.categories);
        })
        .catch((err) => {
          console.error(err);
          setFlash({ type: 'error', message: 'Không tìm thấy món ăn.' });
          navigate('/admin/dishes');
        })
        .finally(() => setLoading(false));
    }
  }, [id, isNew, navigate, setFlash]);

  const addIngredientRow = () => {
    setIngredientRows((prev) => [
      ...prev,
      { ingredientId: '', quantity: '', unit: 'g' },
    ]);
  };

  const removeIngredientRow = (index: number) => {
    setIngredientRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateIngredientRow = (index: number, field: keyof DishIngredientRow, value: string | number) => {
    setIngredientRows((prev) => {
      const next = [...prev];
      const row = { ...next[index]! };

      if (field === 'ingredientId') {
        const strVal = String(value);
        row.ingredientId = strVal;
        // Auto fill unit if not already set or changed
        const matched = ingredients.find((ing) => ing.id === strVal);
        if (matched && (!row.unit || row.unit === 'g')) {
          row.unit = matched.unit || 'g';
        }
      } else if (field === 'quantity') {
        row.quantity = value;
      } else if (field === 'unit') {
        row.unit = String(value);
      }

      next[index] = row;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);

    const formData = new FormData();
    formData.append('name', name);
    if (slug) formData.append('slug', slug);
    if (description) formData.append('description', description);
    formData.append('price', String(price));
    formData.append('category', category);
    if (prepTimeMinutes) formData.append('prepTimeMinutes', String(prepTimeMinutes));
    if (chefId) formData.append('chefId', chefId);
    if (isAvailable) formData.append('isAvailable', 'on');
    if (isFeatured) formData.append('isFeatured', 'on');
    if (removeImage) formData.append('removeImage', 'on');
    if (imageFile) formData.append('image', imageFile);

    // Pass ingredients array as JSON string for server parsing
    formData.append('ingredients', JSON.stringify(ingredientRows));

    try {
      const url = isNew ? '/admin/dishes' : `/admin/dishes/${id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await apiFetch<{ dish: DishRecord; message: string }>(url, {
        method,
        body: formData,
      });

      setFlash({ type: 'success', message: res.message || 'Lưu món ăn thành công.' });
      navigate('/admin/dishes');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) {
          setErrors(err.fields);
        } else {
          setErrors({ _form: err.message });
        }
      } else {
        setErrors({ _form: 'Đã xảy ra lỗi khi lưu món ăn. Thử lại sau.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', fontFamily: 'var(--mono)' }}>
        Đang tải thông tin món ăn...
      </div>
    );
  }

  return (
    <section className="panel form-card">
      <div className="panel-head">
        <h2>{isNew ? 'Thêm món ăn mới' : `Sửa món: ${name}`}</h2>
        <div className="panel-tools">
          <Link className="link-quiet" to="/admin/dishes">
            ← Danh sách món
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field full">
            <p className="form-note">
              Điền thông tin món ăn, chọn danh mục và ghép nguyên liệu theo công thức.
            </p>
            {errors['_form'] ? <p className="err">{errors['_form']}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="name">
              Tên món <span className="req">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="VD: Phở bò tái lăn"
            />
            {errors['name'] ? <p className="err">{errors['name']}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="slug">URL slug</label>
            <input
              type="text"
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              maxLength={120}
              placeholder="pho-bo-tai-lan"
            />
            {errors['slug'] ? <p className="err">{errors['slug']}</p> : null}
            <p className="hint">Để trống sẽ tự sinh từ tên món.</p>
          </div>

          <div className="field full">
            <label htmlFor="description">Mô tả</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Mô tả ngắn về món ăn, nguồn gốc hoặc hương vị..."
            />
            {errors['description'] ? <p className="err">{errors['description']}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="price">
              Giá (VNĐ) <span className="req">*</span>
            </label>
            <input
              type="number"
              id="price"
              step="any"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              placeholder="55000"
            />
            {errors['price'] ? <p className="err">{errors['price']}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="category">
              Danh mục <span className="req">*</span>
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            {errors['category'] ? <p className="err">{errors['category']}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="prepTimeMinutes">Thời gian chuẩn bị (phút)</label>
            <input
              type="number"
              id="prepTimeMinutes"
              min="1"
              value={prepTimeMinutes}
              onChange={(e) => setPrepTimeMinutes(e.target.value)}
              placeholder="15"
            />
            {errors['prepTimeMinutes'] ? (
              <p className="err">{errors['prepTimeMinutes']}</p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="chefId">Đầu bếp phụ trách</label>
            <select id="chefId" value={chefId} onChange={(e) => setChefId(e.target.value)}>
              <option value="">Chưa phân công</option>
              {chefs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.specialty ? ` · ${c.specialty}` : ''}
                  {c.isDeleted ? ' [đã xóa]' : ''}
                </option>
              ))}
            </select>
            {errors['chefId'] ? <p className="err">{errors['chefId']}</p> : null}
          </div>

          <div className="field full">
            <label htmlFor="image">Ảnh món ăn</label>
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
                Còn bán
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
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
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={addIngredientRow}
              >
                + Thêm dòng
              </button>
            </div>
            {errors['ingredients'] ? <p className="err">{errors['ingredients']}</p> : null}

            <div className="ing-rows">
              {ingredientRows.map((row, idx) => (
                <div key={idx} className="ing-row">
                  <select
                    className="ing-sel"
                    value={row.ingredientId}
                    onChange={(e) => updateIngredientRow(idx, 'ingredientId', e.target.value)}
                    required
                  >
                    <option value="">Chọn nguyên liệu</option>
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} ({ing.unit})
                        {ing.isDeleted ? ' [đã xóa]' : ''}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    placeholder="SL"
                    className="ing-qty"
                    value={row.quantity}
                    onChange={(e) => updateIngredientRow(idx, 'quantity', e.target.value)}
                    required
                  />

                  <input
                    type="text"
                    maxLength={30}
                    placeholder="ĐVT"
                    className="ing-unit"
                    value={row.unit}
                    onChange={(e) => updateIngredientRow(idx, 'unit', e.target.value)}
                  />

                  <button
                    type="button"
                    className="remove-row-btn"
                    onClick={() => removeIngredientRow(idx)}
                    title="Xóa dòng"
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
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Đang lưu...' : isNew ? 'Tạo món' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </section>
  );
};
