import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { chefsApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { ApiError, HttpError, type ApiFieldErrors } from '../../../lib/api';
import { ErrorState, Loading, NotFoundState } from '../../../components/StateViews';
import { FieldError, FormError } from '../../../components/FieldError';
import { Avatar } from '../../../components/Avatar';
import type { ChefInput } from '../../../lib/types';

const EMPTY = {
  name: '',
  specialty: '',
  bio: '',
  experienceYears: '0',
  phone: '',
  isActive: true,
};

export default function ChefForm({ mode }: { mode: 'new' | 'edit' }) {
  const { id } = useParams<{ id: string }>();
  const editing = mode === 'edit';
  const navigate = useNavigate();

  const chefState = useApi(
    () => (editing ? chefsApi.get(id ?? '') : Promise.resolve(null)),
    [editing, id],
  );

  const [form, setForm] = useState({ ...EMPTY });
  const [errors, setErrors] = useState<ApiFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const currentAvatarUrl = chefState.data?.avatarUrl ?? null;

  useEffect(() => {
    const chef = chefState.data;
    if (!chef) return;
    setForm({
      name: chef.name,
      specialty: chef.specialty ?? '',
      bio: chef.bio ?? '',
      experienceYears: String(chef.experienceYears),
      phone: chef.phone ?? '',
      isActive: chef.isActive,
    });
  }, [chefState.data]);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);

    const payload: ChefInput = {
      name: form.name,
      specialty: form.specialty.trim() || undefined,
      bio: form.bio.trim() || undefined,
      experienceYears: Number(form.experienceYears) || 0,
      phone: form.phone.trim() || undefined,
      isActive: form.isActive,
    };

    try {
      if (editing) {
        await chefsApi.update(id ?? '', payload, avatarFile, removeImage);
      } else {
        await chefsApi.create(payload, avatarFile);
      }
      navigate('/admin/chefs');
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

  if (editing && chefState.loading) return <Loading />;
  if (editing && chefState.error) {
    if (chefState.error instanceof ApiError && chefState.error.code === 'NOT_FOUND') {
      return (
        <NotFoundState title="Không tìm thấy đầu bếp" message="Đầu bếp này không tồn tại.">
          <Link className="btn btn-solid" to="/admin/chefs">
            Về danh sách
          </Link>
        </NotFoundState>
      );
    }
    return <ErrorState error={chefState.error} onRetry={chefState.reload} />;
  }

  return (
    <section className="panel form-card">
      <div className="panel-head">
        <h2>{editing ? `Sửa hồ sơ: ${form.name}` : 'Thêm đầu bếp mới'}</h2>
        <div className="panel-tools">
          <Link className="link-quiet" to="/admin/chefs">
            ← Danh sách đầu bếp
          </Link>
        </div>
      </div>

      <FormError message={formError} />

      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="field full">
            <p className="form-note">Hồ sơ hiển thị công khai ở trang chi tiết món ăn.</p>
          </div>

          <div className="field">
            <label htmlFor="name">
              Họ và tên <span className="req">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              maxLength={120}
              placeholder="VD: Nguyễn Văn An"
            />
            <FieldError message={errors['name']} />
          </div>

          <div className="field">
            <label htmlFor="specialty">Chuyên môn</label>
            <input
              id="specialty"
              type="text"
              value={form.specialty}
              onChange={(e) => set('specialty', e.target.value)}
              maxLength={120}
              placeholder="VD: Món Việt, Món Âu, Sushi"
            />
            <FieldError message={errors['specialty']} />
          </div>

          <div className="field">
            <label htmlFor="experienceYears">Số năm kinh nghiệm</label>
            <input
              id="experienceYears"
              type="number"
              min="0"
              max="100"
              step="1"
              value={form.experienceYears}
              onChange={(e) => set('experienceYears', e.target.value)}
              placeholder="5"
            />
            <FieldError message={errors['experienceYears']} />
          </div>

          <div className="field">
            <label htmlFor="phone">Số điện thoại</label>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              maxLength={30}
              placeholder="+84 901 234 567"
            />
            <FieldError message={errors['phone']} />
          </div>

          <div className="field full">
            <label htmlFor="bio">Tiểu sử</label>
            <textarea
              id="bio"
              value={form.bio}
              onChange={(e) => set('bio', e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Công việc và thành tựu ẩm thực ngắn gọn..."
            />
            <FieldError message={errors['bio']} />
          </div>

          <div className="field full">
            <label htmlFor="avatar">Ảnh chân dung (JPG, PNG hoặc WebP, tối đa 2MB)</label>
            {avatarFile ? (
              <div className="form-photo">
                <Avatar url={URL.createObjectURL(avatarFile)} name="Ảnh mới" size={96} />
              </div>
            ) : currentAvatarUrl && !removeImage ? (
              <div className="form-photo">
                <Avatar url={currentAvatarUrl} name="Ảnh hiện tại" size={96} />
              </div>
            ) : null}
            <input
              id="avatar"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setAvatarFile(e.target.files?.[0] ?? null);
                setRemoveImage(false);
              }}
            />
            <FieldError message={errors['avatar']} />
            {currentAvatarUrl ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={removeImage}
                  onChange={(e) => {
                    setRemoveImage(e.target.checked);
                    if (e.target.checked) setAvatarFile(null);
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
                  checked={form.isActive}
                  onChange={(e) => set('isActive', e.target.checked)}
                />{' '}
                Đang hoạt động (hiển thị công khai)
              </label>
            </div>
          </div>
        </div>

        <div className="form-foot">
          <span className="left">Trường có dấu * là bắt buộc</span>
          <Link className="btn btn-quiet" to="/admin/chefs">
            Hủy
          </Link>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo đầu bếp'}
          </button>
        </div>
      </form>
    </section>
  );
}
