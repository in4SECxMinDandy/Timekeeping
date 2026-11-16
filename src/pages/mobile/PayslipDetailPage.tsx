import { Link, useParams } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { ErrorState, LoadingBlock } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import {
  DAY_STATUS_LABEL,
  SALARY_TYPE_LABEL,
  dateShort,
  fmtDateVN,
  fmtMoney,
  fmtNumber,
  formatMinutes,
  partyTime,
  periodLabel,
} from '../../lib/format';
import type { Company, Payslip } from '../../lib/types';

export default function PayslipDetailPage() {
  const { period = '' } = useParams<{ period: string }>();
  const { data, error, loading, reload } = useAsync<{ slip: Payslip; company: Company }>(
    () => api.get(`/api/me/payslips/${period}`),
    [period],
  );

  if (loading) {
    return (
      <div className="m-page">
        <LoadingBlock rows={7} />
      </div>
    );
  }

  if (error || !data) {
    const notPublished = error?.includes('công bố');
    return (
      <div className="m-page">
        {notPublished ? (
          <div className="m-card">
            <div className="m-empty">
              <Wallet size={24} />
              <div>Phiếu lương {periodLabel(period)} chưa được công bố.</div>
              <Link
                to="/m/luong"
                className="btn btn-secondary btn-md"
                style={{ marginTop: 12, display: 'inline-flex' }}
              >
                Về danh sách phiếu lương
              </Link>
            </div>
          </div>
        ) : (
          <ErrorState message={error ?? 'Không tải được phiếu lương.'} onRetry={() => reload()} />
        )}
      </div>
    );
  }

  const { slip } = data;
  const days = slip.days.filter(
    (d) =>
      d.cong > 0 ||
      d.otMinutes > 0 ||
      d.status === 'leave' ||
      d.status === 'late' ||
      d.status === 'missing' ||
      d.status === 'absent',
  );

  return (
    <div className="m-page m-page-tight">
      <section className="m-pay-hero">
        <div className="m-pay-hero-label">Thực lĩnh · {periodLabel(slip.period)}</div>
        <div className="m-pay-hero-value">{fmtMoney(slip.net)}</div>
        <div className="m-pay-hero-sub">
          {slip.name} · {slip.positionName}
          {slip.publishedAt ? ` · Công bố ${fmtDateVN(slip.publishedAt.slice(0, 10))}` : ''}
        </div>
      </section>

      <section className="m-sec">
        <div className="m-sec-head">
          <div className="m-sec-title">Chi tiết thu nhập</div>
        </div>
        <div className="m-lines">
          {slip.lines.map((line, i) => (
            <div className={`m-line ${line.amount < 0 ? 'negative' : ''}`} key={`${line.label}-${i}`}>
              <span>
                {line.label}
                {line.note ? <span className="m-caption"> · {line.note}</span> : null}
              </span>
              <b>{fmtMoney(line.amount)}</b>
            </div>
          ))}
          <div className="m-line total">
            <span>Thực lĩnh</span>
            <b>{fmtMoney(slip.net)}</b>
          </div>
        </div>
      </section>

      <section className="m-sec">
        <div className="m-sec-head">
          <div className="m-sec-title">Thông tin kỳ lương</div>
        </div>
        <div className="m-card">
          <div className="m-day-rows">
            <div className="m-day-row"><span>Hình thức lương</span><b>{SALARY_TYPE_LABEL[slip.salaryType]}</b></div>
            <div className="m-day-row"><span>Lương cơ bản</span><b>{fmtMoney(slip.baseSalary)}</b></div>
            <div className="m-day-row"><span>Ngày công</span><b>{fmtNumber(slip.cong)} / {fmtNumber(slip.standardDays)}</b></div>
            <div className="m-day-row"><span>Giờ làm thực tế</span><b>{formatMinutes(slip.workedMinutes)}</b></div>
            <div className="m-day-row"><span>Tăng ca</span><b>{formatMinutes(slip.otMinutes)}</b></div>
          </div>
        </div>
      </section>

      {days.length ? (
        <section className="m-sec">
          <div className="m-sec-head">
            <div className="m-sec-title">Chấm công trong kỳ <span>{days.length} ngày</span></div>
          </div>
          <div className="m-list">
            {days.map((day) => (
              <div className="m-row" key={day.date}>
                <div className="m-row-body">
                  <div className="m-row-title">
                    {dateShort(day.date)}
                    <span className="m-caption">· {DAY_STATUS_LABEL[day.status] ?? day.label}</span>
                  </div>
                  <div className="m-row-sub">
                    {day.inAt ? `${partyTime(day.inAt)} → ${partyTime(day.outAt) || '—'}` : day.label}
                    {day.otMinutes ? ` · OT ${formatMinutes(day.otMinutes)}` : ''}
                  </div>
                </div>
                <div className="m-row-side">{fmtNumber(day.cong)} công</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="m-caption" style={{ padding: '0 4px' }}>
        Phiếu lương do {data.company.name} công bố. Nếu có thắc mắc về số liệu, bạn có thể gửi đơn giải trình trong mục Đơn từ.
      </div>
    </div>
  );
}
