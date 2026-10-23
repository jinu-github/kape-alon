import { useQuery } from '@tanstack/react-query';
import { formatMoney } from '@kape/shared';
import { adminApi } from '../../lib/admin';
import { retryRead } from '../../lib/api';
import { AsyncState } from '../AsyncState';
export function AdminDashboard() {
  const query = useQuery({
    queryKey: ['staff', 'admin', 'dashboard'],
    queryFn: adminApi.dashboard,
    retry: retryRead,
    refetchInterval: 30000,
  });
  if (query.isPending) return <AsyncState loading />;
  if (query.isError)
    return (
      <AsyncState error={query.error} onRetry={() => void query.refetch()} />
    );
  const data = query.data;
  const max = Math.max(1, ...data.hours.map((hour) => hour.count));
  return (
    <section>
      <h2>Today at a glance</h2>
      <p className="muted">
        {data.date} · {data.timezone}. Revenue and top items count served orders
        only; order counts include all statuses.
      </p>
      <div className="admin-stats">
        <article>
          <span>Orders today</span>
          <strong>{data.ordersToday}</strong>
        </article>
        <article>
          <span>Revenue today</span>
          <strong>{formatMoney(data.revenueTodayCents)}</strong>
        </article>
      </div>
      <div className="admin-report-grid">
        <article className="admin-panel">
          <h3>Top 5 items today</h3>
          {data.topItems.length ? (
            <ol className="top-items">
              {data.topItems.map((item) => (
                <li key={item.name}>
                  <span>{item.name}</span>
                  <strong>{item.quantity} sold</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p>No served items yet today.</p>
          )}
        </article>
        <article className="admin-panel">
          <h3>Orders per hour</h3>
          <div
            className="hour-chart"
            role="img"
            aria-label="Orders per hour. Exact counts are in the table below."
          >
            {data.hours.map((hour) => (
              <div
                key={hour.hour}
                title={hour.hour + ':00 — ' + hour.count + ' orders'}
              >
                <span
                  style={{
                    height: Math.max(2, (hour.count / max) * 120) + 'px',
                  }}
                />
                <small>{hour.hour % 3 === 0 ? hour.hour : ''}</small>
              </div>
            ))}
          </div>
          <details>
            <summary>View hourly counts</summary>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Hour</th>
                  <th>Orders</th>
                </tr>
              </thead>
              <tbody>
                {data.hours.map((hour) => (
                  <tr key={hour.hour}>
                    <td>{String(hour.hour).padStart(2, '0')}:00</td>
                    <td>{hour.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </article>
      </div>
    </section>
  );
}
