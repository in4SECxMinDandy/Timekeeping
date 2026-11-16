import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Info, Wallet } from 'lucide-react';
import { ErrorState, LoadingBlock } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { fmtDateVN, fmtMoney, fmtNumber, periodLabel, todayIct } from '../../lib/format';
import type { EmployeePayslipsData } from '../../lib/types';

export default function PayslipsPage() {
  const [year, setYear] = useState(() => Number(todayIct().slice(0, 4)));
  const { data, error, loading, reload } = useAsync<EmployeePayslipsData>(
    () => api.get(`/api/me/payslips?year=${year}`),
    [year],
  );

  if (loading) {
    return (
      <div className="m-page">
        <LoadingBlock rows={6} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="m-page">
        <ErrorState message={error ?? 'Không tải được phiếu lương.'} onRetry={() => reload()} />
      </div>
    );
  }

  const published = data.months.filter((m) => m.state === 'published');
  const total = published.reduce((sum, m) => sum + (m.net ?? 0), 0);
  const working = data.months.find((m) => m.state === 'working');

  return (
    <div className="m-page m-page-tight">
      <section className="m-pay-hero">
        <div className="m-pay-hero-label">Tổng thực lĩnh năm {year}</div>
        <div className="m-pay-hero-value">{fmtMoney(total)}</div>
        <div className="m-pay-hero-sub">
          {published.length ? `${published.length} phiếu lương đã công bố` : 'Chưa có phiếu lương được công bố'}
        </div>
      </section>

      <div className="m-tabs-scroll">
        {data.years.map((y) => (
          <button
            type="button"
            key={y}
            className={`m-filter ${y === year ? 'active' : ''}`}
            onClick={() => setYear(y)}
          >
            Năm {y}
          </button>
        ))}
      </div>

      {working ? (
        <div className="m-banner info">
          <Info size={15} />
          <span>
            {periodLabel(working.period)} đang được tính lương. Phiếu sẽ hiển thị ngay khi công ty công bố.
          </span>
        </div>
      ) : null}

      <section className="m-sec">
        <div className="m-sec-head">
          <div className="m-sec-title">Phiếu lương theo tháng</div>
          <span className="m-caption">{published.length} đã công bố</span>
        </div>

        <div className="m-req-list">
          {[...data.months].reverse().map((month) => {
            const monthNumber = Number(month.period.slice(5));
            if (month.state === 'published') {
              return (
                <Link
                  to={`/m/luong/${month.period}`}
                  key={month.period}
                  className="m-pay-card published"
                >
                  <span className="m-pay-month">
                    <b>{monthNumber}</b>
                    <span>Tháng</span>
                  </span>
                  <div className="m-pay-info">
                    <b>Tháng {monthNumber}/{year}</b>
                    <span>
                      {month.cong !== undefined ? `${fmtNumber(month.cong)} công · ` : ''}
                      Đã công bố
                    </span>
                  </div>
                  <div className="m-pay-amount">
                    <b>{fmtMoney(month.net ?? 0)}</b>
                    <span>{month.publishedAt ? fmtDateVN(month.publishedAt.slice(0, 10)) : ''}</span>
                  </div>
                  <ChevronRight size={16} className="m-row-chevron" />
                </Link>
              );
            }
            return (
              <div className="m-pay-card" key={month.period}>
                <span className="m-pay-month">
                  <b>{monthNumber}</b>
                  <span>Tháng</span>
                </span>
                <div className="m-pay-info">
                  <b>Tháng {monthNumber}/{year}</b>
                  <span>
                    {month.state === 'working'
                      ? 'Đang tính lương'
                      : month.state === 'future'
                        ? 'Chưa tới kỳ lương'
                        : 'Chưa được công bố'}
                  </span>
                </div>
                <div className="m-pay-amount">
                  <b style={{ color: 'var(--muted-2)' }}>—</b>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="m-card">
        <div className="m-inline" style={{ alignItems: 'flex-start' }}>
          <Wallet size={16} className="m-muted" />
          <div className="m-caption">
            Phiếu lương chỉ hiển thị sau khi công ty chốt và công bố kỳ lương. Nếu có thắc mắc, bạn gửi đơn giải trình
            hoặc liên hệ bộ phận nhân sự.
          </div>
        </div>
      </div>
    </div>
  );
}
