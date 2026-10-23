import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  cafeConfig,
  formatMoney,
  historyFilterSchema,
  orderStatuses,
} from '@kape/shared';
import type { HistoryFilter } from '@kape/shared';
import { adminApi } from '../../lib/admin';
import { retryRead } from '../../lib/api';
import { AsyncState } from '../AsyncState';
import { Sheet } from '../Sheet';
export function AdminHistory() {
  const [filter, setFilter] = useState<HistoryFilter>({ page: 1 });
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['staff', 'admin', 'history', filter],
    queryFn: () => adminApi.history(filter),
    retry: retryRead,
  });
  return (
    <section>
      <h2>Order history</h2>
      <p className="muted">
        Dates use {cafeConfig.timezone}. Up to 50 orders per page.
      </p>
      <form
        className="admin-filters"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const parsed = historyFilterSchema.safeParse({
            ...(data.get('from') ? { from: data.get('from') } : {}),
            ...(data.get('to') ? { to: data.get('to') } : {}),
            ...(data.get('status') ? { status: data.get('status') } : {}),
            page: 1,
          });
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? 'Check filters');
            return;
          }
          setError('');
          setFilter(parsed.data);
        }}
      >
        <label>
          From
          <input name="from" type="date" />
        </label>
        <label>
          Through
          <input name="to" type="date" />
        </label>
        <label>
          Status
          <select name="status">
            <option value="">All statuses</option>
            {orderStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <button className="button">Apply filters</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {query.isPending ? (
        <AsyncState loading />
      ) : query.isError ? (
        <AsyncState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {query.data.orders.length ? (
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Placed</th>
                    <th>Table</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        {new Date(order.createdAt).toLocaleString(
                          cafeConfig.locale,
                          { timeZone: cafeConfig.timezone },
                        )}
                      </td>
                      <td>{order.tableNumber}</td>
                      <td>{order.status}</td>
                      <td>{formatMoney(order.totalCents)}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setSelected(order.id)}
                        >
                          View #{order.id.slice(-8)}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-panel">No orders match these filters.</p>
          )}
          <div className="admin-actions">
            <button
              disabled={filter.page === 1}
              onClick={() => setFilter({ ...filter, page: filter.page - 1 })}
            >
              Previous
            </button>
            <span>Page {filter.page}</span>
            <button
              disabled={!query.data.hasMore}
              onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
            >
              Next
            </button>
          </div>
        </>
      )}
      {selected && (
        <OrderDetail id={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
function OrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['staff', 'admin', 'order', id],
    queryFn: () => adminApi.order(id),
    retry: retryRead,
  });
  return (
    <Sheet title="Order detail" onClose={onClose}>
      <div className="sheet-content">
        {query.isPending ? (
          <AsyncState loading />
        ) : query.isError ? (
          <AsyncState
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <h2>
              Table {query.data.tableNumber} · {query.data.status}
            </h2>
            <p className="fine-print">{id}</p>
            {query.data.items.map((item) => (
              <article className="admin-panel" key={item.id}>
                <strong>
                  {item.quantity} × {item.name}
                </strong>
                <p>{item.choices.map((choice) => choice.name).join(', ')}</p>
                <p>{item.notes}</p>
                <p>{formatMoney(item.unitPriceCents * item.quantity)}</p>
              </article>
            ))}
            <p>{query.data.notes}</p>
            <strong>Total {formatMoney(query.data.totalCents)}</strong>
          </>
        )}
      </div>
    </Sheet>
  );
}
