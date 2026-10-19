import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.js';
import { can } from '../../lib/permissions.js';
import { formatVnd, CATEGORY_LABELS } from '../../lib/format.js';

interface DashboardData {
  stats: {
    dishCount: number;
    chefCount: number;
    ingredientCount: number;
    userCount: number;
  };
  recentDishes: Array<{
    id: string;
    name: string;
    slug: string;
    price: number | string;
    category: string;
    imageUrl: string | null;
    isAvailable: boolean;
    chef?: { name: string } | null;
  }>;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<DashboardData>('/admin/stats')
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', fontFamily: 'var(--mono)' }}>
        Đang tải bảng điều khiển...
      </div>
    );
  }

  const stats = data?.stats;
  const recentDishes = data?.recentDishes || [];

  return (
    <>
      <div className="stats">
        <div className="stat">
          <div className="k">Tổng món ăn</div>
          <div className="v">{stats?.dishCount ?? 0}</div>
          <div className="d">đang quản lý</div>
        </div>
        <div className="stat">
          <div className="k">Đầu bếp</div>
          <div className="v">{stats?.chefCount ?? 0}</div>
          <div className="d">đang hoạt động</div>
        </div>
        <div className="stat">
          <div className="k">Nguyên liệu</div>
          <div className="v">{stats?.ingredientCount ?? 0}</div>
          <div className="d">trong kho</div>
        </div>
        <div className="stat">
          <div className="k">Người dùng</div>
          <div className="v">{stats?.userCount ?? 0}</div>
          <div className="d">đã đăng ký</div>
        </div>
      </div>

      <section className="panel" style={{ marginBottom: '26px' }}>
        <div className="panel-head">
          <h2>Thao tác nhanh</h2>
          <div className="panel-tools">
            <Link className="btn btn-primary" to="/admin/dishes/new">
              Thêm món
            </Link>
            <Link className="btn" to="/admin/chefs/new">
              Thêm đầu bếp
            </Link>
            <Link className="btn" to="/admin/ingredients/new">
              Thêm nguyên liệu
            </Link>
            {user && can(user, 'user:manage') ? (
              <Link className="btn btn-quiet" to="/admin/users">
                Phân quyền
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Món ăn cập nhật gần đây</h2>
          <span className="count">{recentDishes.length} bản ghi</span>
          <div className="panel-tools">
            <Link className="btn btn-quiet btn-sm" to="/admin/dishes">
              Xem tất cả
            </Link>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '70px' }}>Hình</th>
                <th>Tên món</th>
                <th>Danh mục</th>
                <th style={{ width: '120px' }}>Giá</th>
                <th>Đầu bếp</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody className="fade-late">
              {recentDishes.length > 0 ? (
                recentDishes.map((dish) => (
                  <tr key={dish.id}>
                    <td>
                      {dish.imageUrl ? (
                        <img className="thumb" src={dish.imageUrl} alt={dish.name} loading="lazy" />
                      ) : (
                        <span className="thumb-ph">—</span>
                      )}
                    </td>
                    <td>
                      <div className="cell-item">
                        <div>
                          <b>{dish.name}</b>
                          <small>/dishes/{dish.slug}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge">
                        {CATEGORY_LABELS[dish.category] ?? dish.category}
                      </span>
                    </td>
                    <td className="num">{formatVnd(dish.price)}</td>
                    <td>{dish.chef ? dish.chef.name : '—'}</td>
                    <td>
                      {dish.isAvailable ? (
                        <span className="badge ok">Đang bán</span>
                      ) : (
                        <span className="badge warn">Ngừng bán</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn btn-sm btn-quiet" to={`/admin/dishes/${dish.id}/edit`}>
                          Sửa
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              ) : null}
            </tbody>
          </table>

          {recentDishes.length === 0 ? (
            <div className="empty">
              <b>Chưa có món ăn nào</b>
              Bắt đầu bằng cách thêm món đầu tiên vào thực đơn.
              <div style={{ marginTop: '18px' }}>
                <Link className="btn btn-primary" to="/admin/dishes/new">
                  Thêm món
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
};
