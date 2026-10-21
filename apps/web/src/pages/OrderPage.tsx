import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { formatMoney, idSchema, orderResponseSchema } from '@kape/shared';
import { api, apiOrigin, retryRead } from '../lib/api';
import { CafeShell } from '../components/CafeShell';
import { AsyncState } from '../components/AsyncState';

const steps = [
  {
    status: 'received',
    title: 'Received',
    detail: 'Your order is with our team.',
  },
  {
    status: 'preparing',
    title: 'Preparing',
    detail: 'A little care goes into every order.',
  },
  {
    status: 'ready',
    title: 'Ready',
    detail: 'Freshly made and coming your way.',
  },
  { status: 'served', title: 'Served', detail: 'Enjoy every sip and bite.' },
];
export function OrderPage() {
  const { id = '' } = useParams();
  if (!idSchema.safeParse(id).success)
    return (
      <CafeShell>
        <main id="main">
          <AsyncState
            title="That order link is incomplete."
            error={
              new Error('Please open the link you received after ordering.')
            }
          />
        </main>
      </CafeShell>
    );
  return <OrderTracker key={id} id={id} />;
}
function OrderTracker({ id }: { id: string }) {
  const cache = useQueryClient();
  const [connected, setConnected] = useState(false);
  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.order(id),
    retry: retryRead,
    // Also recovers state if a server event is missed or a different process updates the DB.
    refetchInterval: (query) =>
      ['served', 'cancelled'].includes(query.state.data?.status ?? '')
        ? false
        : 10000,
  });
  useEffect(() => {
    // Polling starts the connection; Socket.IO upgrades when WebSockets work.
    const socket = io(apiOrigin, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelayMax: 5000,
    });
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('order:join', id);
      void cache.invalidateQueries({ queryKey: ['order', id] });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('order:error', () => {
      setConnected(false);
      void cache.invalidateQueries({ queryKey: ['order', id] });
    });
    socket.on('order:updated', (value: unknown) => {
      const parsed = orderResponseSchema.safeParse(value);
      if (parsed.success && parsed.data.id === id)
        void cache.invalidateQueries({ queryKey: ['order', id] });
    });
    return () => {
      socket.disconnect();
    };
  }, [id, cache]);
  const data = order.data;
  const current = steps.findIndex((step) => step.status === data?.status);
  return (
    <CafeShell {...(data ? { table: data.tableNumber } : {})}>
      <main id="main" className="tracking-main">
        {order.isPending ? (
          <AsyncState loading />
        ) : !data ? (
          <AsyncState
            error={order.error}
            onRetry={() => {
              void order.refetch();
            }}
          />
        ) : (
          <>
            <div className="tracking-intro">
              <span className="tracking-mark" aria-hidden="true">
                ≈
              </span>
              <p className="eyebrow">ORDER #{id.slice(0, 8).toUpperCase()}</p>
              <h1>
                {data.status === 'cancelled'
                  ? 'Your order was cancelled.'
                  : data.status === 'served'
                    ? 'Enjoy your little pause.'
                    : 'You’re in good hands.'}
              </h1>
              <p>
                {data.status === 'cancelled'
                  ? 'Please speak with the cafe team if you need a hand.'
                  : 'Sit back. We’ll keep you posted right here.'}
              </p>
              <p className="connection-state" role="status">
                {connected
                  ? '● Live updates connected'
                  : 'Reconnecting… We’re also checking your order automatically.'}
              </p>
            </div>
            {order.isError && (
              <p className="error-message" role="alert">
                Updates are temporarily unavailable. Showing your last known
                order status.{' '}
                <button
                  onClick={() => {
                    void order.refetch();
                  }}
                >
                  Retry now
                </button>
              </p>
            )}
            <section className="tracking-card" aria-label="Order progress">
              <div role="status" className="sr-only">
                Order status: {data.status}
              </div>
              {data.status === 'cancelled' && (
                <p>
                  This order is closed. The cafe team can help you place a new
                  one.
                </p>
              )}
              {data.status !== 'cancelled' && (
                <ol className="progress-steps">
                  {steps.map((step, index) => (
                    <li
                      className={index <= current ? 'complete' : ''}
                      key={step.status}
                      aria-current={index === current ? 'step' : undefined}
                    >
                      <span className="step-marker" aria-hidden="true">
                        {index < current ? '✓' : index + 1}
                      </span>
                      <div>
                        <h2>{step.title}</h2>
                        <p>{step.detail}</p>
                      </div>
                      {index === current && (
                        <span className="current-step">Now</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="receipt">
              <div className="category-heading">
                <h2>Your order</h2>
                <span>Table {data.tableNumber}</span>
              </div>
              <ul>
                {data.items.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>
                        {item.quantity} × {item.name}
                      </strong>
                      <p>
                        {item.choices.map((choice) => choice.name).join(' · ')}
                      </p>
                      {item.notes && <p className="line-note">{item.notes}</p>}
                    </div>
                    <span>
                      {formatMoney(item.unitPriceCents * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              {data.notes && (
                <p className="line-note">Table note: {data.notes}</p>
              )}
              <div className="cart-total">
                <span>Total</span>
                <strong>{formatMoney(data.totalCents)}</strong>
              </div>
              <p className="fine-print">
                Placed{' '}
                {new Date(data.createdAt).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}{' '}
                · Demo order, no payment collected
              </p>
            </section>
            <Link className="back-to-menu" to={'/t/' + data.tableNumber}>
              ← Back to the menu
            </Link>
          </>
        )}
      </main>
    </CafeShell>
  );
}
