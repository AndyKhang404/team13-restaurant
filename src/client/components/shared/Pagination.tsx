import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

export interface PaginationData {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevPage: number;
  nextPage: number;
  baseQuery: string;
}

interface PaginationProps {
  pagination?: PaginationData | null;
}

export const Pagination: React.FC<PaginationProps> = ({ pagination }) => {
  const [searchParams] = useSearchParams();

  if (!pagination || pagination.totalPages <= 1) return null;

  const createPageUrl = (pageNumber: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(pageNumber));
    return `?${params.toString()}`;
  };

  return (
    <div className="panel-foot">
      Hiển thị trang {pagination.page} / {pagination.totalPages} — tổng {pagination.total} bản ghi
      <div className="pager">
        {pagination.hasPrev ? (
          <Link to={createPageUrl(pagination.prevPage)}>Trước</Link>
        ) : (
          <span>Trước</span>
        )}
        <span className="current">{pagination.page}</span>
        {pagination.hasNext ? (
          <Link to={createPageUrl(pagination.nextPage)}>Sau</Link>
        ) : (
          <span>Sau</span>
        )}
      </div>
    </div>
  );
};
