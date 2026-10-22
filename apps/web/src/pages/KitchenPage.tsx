import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { cafeConfig } from '@kape/shared';
import type { OrderResponse, OrderStatus, StaffUser } from '@kape/shared';
import { apiOrigin, ApiError, retryRead } from '../lib/api';
import { staffApi } from '../lib/staff';
import { StaffGate } from '../components/StaffGate';
import { StaffHeader } from '../components/StaffHeader';
import { AsyncState } from '../components/AsyncState';

const columns = [
  {
    status: 'received',
    label: 'New',
    next: 'preparing',
    action: 'Start preparing',
  },
  {
    status: 'preparing',
    label: 'Preparing',
    next: 'ready',
    action: 'Mark ready',
  },
  { status: 'ready', label: 'Ready', next: 'served', action: 'Mark served' },
] as const;

export function KitchenPage() {
  return (
    <StaffGate role="kitchen">
      {(user) => <KitchenBoard user={user} />}
    </StaffGate>
  );
}

function KitchenBoard({ user }: { user: StaffUser }) {
  const cache = useQueryClient();
  const orders = useQuery({
    queryKey: ['staff', 'orders'],
    queryFn: staffApi.orders,
    retry: retryRead,
    refetchInterval: 10000,
  });
  const [connected, setConnected] = useState(false);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (orders.error instanceof ApiError && orders.error.status === 401)
      void cache.invalidateQueries({ queryKey: ['staff', 'me'] });
  }, [orders.error, cache]);
  useEffect(() => {
    const socket = io(apiOrigin + '/kitchen', {
      withCredentials: true,
      transports: ['polling', 'websocket'],
      reconnection: true,
    });
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const refresh = () => {
      void cache.invalidateQueries({ queryKey: ['staff', 'orders'] });
    };
    socket.on('connect', () => {
      setConnected(true);
      refresh();
      void cache.invalidateQueries({ queryKey: ['staff', 'me'] });
    });
    socket.on('disconnect', () => {
      setConnected(false);
      void cache.invalidateQueries({ queryKey: ['staff', 'me'] });
    });
    socket.on('connect_error', () => setConnected(false));
    socket.on('kitchen:refresh', refresh);
    socket.on('kitchen:changed', (event: unknown) => {
      refresh();
      if (
        typeof event !== 'object' ||
        !event ||
        !('id' in event) ||
        typeof event.id !== 'string' ||
        !('created' in event) ||
        event.created !== true
      )
        return;
      const id = event.id;
      setHighlighted((current) => new Set([...current, id]));
      const timer = setTimeout(() => {
        setHighlighted((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        timers.delete(timer);
      }, 12000);
      timers.add(timer);
    });
    return () => {
      socket.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [cache]);
  return (
    <>
      <StaffHeader user={user} />
      <main id="main" className="kitchen-main">
        <div className="kitchen-heading">
          <div>
            <p className="eyebrow">GOOD FOOD, GOOD TIMING</p>
            <h1>Kitchen board</h1>
            <p>From the first ticket to the final plate.</p>
          </div>
          <p role="status" className="connection-state">
            {connected
              ? '● Live updates connected'
              : 'Reconnecting · checking every 10 seconds'}
          </p>
        </div>
        <p className="kitchen-help">
          New tickets glow for 12 seconds. Orders waiting{' '}
          {cafeConfig.kitchenWarningMinutes} minutes are highlighted.
        </p>
        {orders.isPending ? (
          <AsyncState loading />
        ) : orders.isError ? (
          <AsyncState
            error={orders.error}
            onRetry={() => void orders.refetch()}
          />
        ) : (
          <div className="kitchen-columns">
            {columns.map((column) => {
              const tickets = orders.data.filter(
                (order) => order.status === column.status,
              );
              return (
                <section
                  key={column.status}
                  className="kitchen-column"
                  aria-labelledby={'column-' + column.status}
                >
                  <h2 id={'column-' + column.status}>
                    {column.label} <span>{tickets.length}</span>
                  </h2>
                  {tickets.length === 0 ? (
                    <p className="empty-tickets">
                      No {column.label.toLowerCase()} orders. A little breathing
                      room.
                    </p>
                  ) : (
                    tickets.map((order) => (
                      <KitchenTicket
                        key={order.id}
                        order={order}
                        now={now}
                        highlighted={highlighted.has(order.id)}
                        next={column.next}
                        action={column.action}
                      />
                    ))
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

function KitchenTicket({
  order,
  now,
  highlighted,
  next,
  action,
}: {
  order: OrderResponse;
  now: number;
  highlighted: boolean;
  next: OrderStatus;
  action: string;
}) {
  const cache = useQueryClient();
  const minutes = Math.max(
    0,
    Math.floor((now - Date.parse(order.createdAt)) / 60000),
  );
  const update = useMutation({
    mutationFn: () => staffApi.status(order.id, next),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['staff', 'orders'] });
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: ['staff', 'orders'] });
      void cache.invalidateQueries({ queryKey: ['staff', 'me'] });
    },
  });
  return (
    <article
      data-testid={'ticket-' + order.id}
      className={
        'kitchen-ticket' +
        (highlighted ? ' ticket-new' : '') +
        (minutes >= cafeConfig.kitchenWarningMinutes ? ' ticket-overdue' : '')
      }
    >
      <header>
        <h3>Table {order.tableNumber}</h3>
        <span>{minutes < 1 ? 'Just in' : minutes + ' min'}</span>
      </header>
      <p className="ticket-number">
        #{order.id.slice(0, 8)}{' '}
        {highlighted && <strong role="status">New order</strong>}
        {minutes >= cafeConfig.kitchenWarningMinutes && (
          <strong> · Waiting a while</strong>
        )}
      </p>
      <ul>
        {order.items.map((item) => (
          <li key={item.id}>
            <strong>
              {item.quantity} × {item.name}
            </strong>
            {item.choices.length > 0 && (
              <p>{item.choices.map((choice) => choice.name).join(' · ')}</p>
            )}
            {item.notes && (
              <p className="ticket-note">Item note: {item.notes}</p>
            )}
          </li>
        ))}
      </ul>
      {order.notes && <p className="ticket-note">Order note: {order.notes}</p>}
      {update.isError && (
        <p role="alert" className="error-message">
          {update.error.message}
        </p>
      )}
      <button
        className="button full"
        disabled={update.isPending}
        onClick={() => update.mutate()}
      >
        {update.isPending ? 'Updating…' : action}
      </button>
    </article>
  );
}
