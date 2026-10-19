import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../../../lib/api.js';
import { Avatar } from '../../../components/shared/Avatar.js';
import { useFlash } from '../../../context/FlashContext.js';

interface ChefRecord {
  id: string;
  name: string;
  specialty?: string | null;
  experienceYears?: number | null;
  phone?: string | null;
  bio?: string | null;
  isActive?: boolean;
  avatarUrl?: string | null;
}

export const ChefFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { setFlash } = useFlash();

  const [loading, setLoading] = useState(!isNew);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [experienceYears, setExperienceYears] = useState<number | string>(0);
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [existingAvatarUrl, setExistingAvatarUrl] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isNew) {
      apiFetch<{ chef: ChefRecord }>(`/admin/chefs/${id}`)
        .then((res) => {
          const c = res.chef;
          setName(c.name || '');
          setSpecialty(c.specialty || '');
          setExperienceYears(c.experienceYears ?? 0);
          setPhone(c.phone || '');
          setBio(c.bio || '');
          setIsActive(Boolean(c.isActive));
          setExistingAvatarUrl(c.avatarUrl || null);
        })
        .catch((err) => {
          console.error(err);
          setFlash({ type: 'error', message: 'Không tìm thấy đầu bếp.' });
          navigate('/admin/chefs');
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
    if (specialty) formData.append('specialty', specialty);
    formData.append('experienceYears', String(experienceYears));
    if (phone) formData.append('phone', phone);
    if (bio) formData.append('bio', bio);
    if (isActive) formData.append('isActive', 'on');
    if (removeImage) formData.append('removeImage', 'on');
    if (avatarFile) formData.append('avatar', avatarFile);

    try {
      const url = isNew ? '/admin/chefs' : `/admin/chefs/${id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await apiFetch<{ chef: ChefRecord; message: string }>(url, {
        method,
        body: formData,
      });

      setFlash({ type: 'success', message: res.message || 'Lưu đầu bếp thành công.' });
      navigate('/admin/chefs');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) {
          setErrors(err.fields);
        } else {
          setErrors({ _form: err.message });
        }
      } else {
        setErrors({ _form: 'Đã xảy ra lỗi khi lưu đầu bếp. Thử lại sau.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', fontFamily: 'var(--mono)' }}>
        Đang tải thông tin đầu bếp...
      </div>
    );
  }

  return (
    <section className="panel form-card">
      <div className="panel-head">
        <h2>{isNew ? 'Thêm đầu bếp mới' : `Sửa hồ sơ: ${name}`}</h2>
        <div className="panel-tools">
          <Link className="link-quiet" to="/admin/chefs">
            ← Danh sách đầu bếp
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field full">
            <p className="form-note">Hồ sơ hiển thị công khai ở trang chi tiết món ăn.</p>
            {errors['_form'] ? <p className="err">{errors['_form']}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="name">
              Họ và tên <span className="req">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="VD: Nguyễn Văn An"
            />
            {errors['name'] ? <p className="err">{errors['name']}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="specialty">Chuyên môn</label>
            <input
              type="text"
              id="specialty"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              maxLength={120}
              placeholder="VD: Món Việt, Món Âu, Sushi"
            />
            {errors['specialty'] ? <p className="err">{errors['specialty']}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="experienceYears">Số năm kinh nghiệm</label>
            <input
              type="number"
              id="experienceYears"
              min={0}
              max={100}
              step={1}
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
              placeholder="5"
            />
            {errors['experienceYears'] ? (
              <p className="err">{errors['experienceYears']}</p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="phone">Số điện thoại</label>
            <input
              type="tel"
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={30}
              placeholder="+84 901 234 567"
            />
            {errors['phone'] ? <p className="err">{errors['phone']}</p> : null}
          </div>

          <div className="field full">
            <label htmlFor="bio">Tiểu sử</label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Công việc và thành tựu ẩm thực ngắn gọn..."
            />
            {errors['bio'] ? <p className="err">{errors['bio']}</p> : null}
          </div>

          <div className="field full">
            <label htmlFor="avatar">Ảnh chân dung</label>
            {existingAvatarUrl ? (
              <div className={`form-photo ${removeImage ? 'is-removed' : ''}`.trim()}>
                <Avatar url={existingAvatarUrl} name="Ảnh hiện tại" size={96} />
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
              id="avatar"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setAvatarFile(f || null);
              }}
            />
            {errors['avatar'] ? <p className="err">{errors['avatar']}</p> : null}
            <p className="hint">JPG, PNG hoặc WebP · tối đa 2 MB.</p>
          </div>

          <div className="field full">
            <div className="check-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
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
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Đang lưu...' : isNew ? 'Tạo đầu bếp' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </section>
  );
};
