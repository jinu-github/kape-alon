import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { createOrderSchema, formatMoney } from '@kape/shared';
import { Sheet } from './Sheet';
import { api } from '../lib/api';
import { linePrice } from '../lib/cart';
import type { CartLine } from '../lib/cart';

export function CartSheet({
  table,
  lines,
  onChange,
  onClose,
}: {
  table: number;
  lines: CartLine[];
  onChange: (lines: CartLine[]) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [notes, setNotes] = useState('');
  const submit = useMutation({
    mutationFn: () =>
      api.createOrder(
        createOrderSchema.parse({
          tableNumber: table,
          notes,
          items: lines.map((line) => ({
            menuItemId: line.item.id,
            quantity: line.quantity,
            choiceIds: line.choiceIds,
            notes: line.notes,
          })),
        }),
      ),
    retry: false,
    onSuccess: (order) => {
      try {
        localStorage.setItem('last-order:' + table, order.id);
      } catch {
        /* Storage may be disabled. */
      }
      onChange([]);
      navigate('/orders/' + order.id);
    },
  });
  const total = lines.reduce(
    (sum, line) => sum + linePrice(line) * line.quantity,
    0,
  );
  return (
    <Sheet
      title={'Your order · Table ' + table}
      onClose={() => {
        if (!submit.isPending) onClose();
      }}
    >
      <div className="sheet-content">
        <h2>A little something good.</h2>
        {lines.length === 0 ? (
          <div className="state-panel">
            <p>Your order is empty. Find your next favorite on the menu.</p>
            <button className="button" onClick={onClose}>
              Explore the menu
            </button>
          </div>
        ) : (
          <>
            <ul className="cart-lines">
              {lines.map((line) => (
                <li key={line.key}>
                  <div className="cart-line-heading">
                    <h3>{line.item.name}</h3>
                    <strong>
                      {formatMoney(linePrice(line) * line.quantity)}
                    </strong>
                  </div>
                  <p className="muted">
                    {line.item.options
                      .flatMap((group) => group.choices)
                      .filter((choice) => line.choiceIds.includes(choice.id))
                      .map((choice) => choice.name)
                      .join(' · ')}
                  </p>
                  {line.notes && <p className="line-note">{line.notes}</p>}
                  <div className="quantity-control">
                    <button
                      disabled={submit.isPending}
                      aria-label={'Decrease ' + line.item.name}
                      onClick={() =>
                        onChange(
                          lines.flatMap((entry) =>
                            entry.key !== line.key
                              ? [entry]
                              : entry.quantity > 1
                                ? [{ ...entry, quantity: entry.quantity - 1 }]
                                : [],
                          ),
                        )
                      }
                    >
                      −
                    </button>
                    <span aria-label={'Quantity ' + line.quantity}>
                      {line.quantity}
                    </span>
                    <button
                      disabled={submit.isPending || line.quantity === 20}
                      aria-label={'Increase ' + line.item.name}
                      onClick={() =>
                        onChange(
                          lines.map((entry) =>
                            entry.key === line.key
                              ? { ...entry, quantity: entry.quantity + 1 }
                              : entry,
                          ),
                        )
                      }
                    >
                      +
                    </button>
                    <button
                      className="remove-link"
                      disabled={submit.isPending}
                      onClick={() =>
                        onChange(
                          lines.filter((entry) => entry.key !== line.key),
                        )
                      }
                      aria-label={'Remove ' + line.item.name}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <label className="notes-label" htmlFor="order-notes">
              Note for your table <span>Optional</span>
            </label>
            <textarea
              id="order-notes"
              value={notes}
              disabled={submit.isPending}
              maxLength={500}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything else we should know?"
            />
            <div className="cart-total">
              <span>Total</span>
              <strong>{formatMoney(total)}</strong>
            </div>
            <p className="fine-print">
              Final prices and availability are checked by the cafe. This demo
              does not collect payment.
            </p>
            {submit.isError && (
              <p className="error-message" role="alert">
                {submit.error.message}
              </p>
            )}
            <button
              className="button full"
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? 'Sending to the kitchen…' : 'Place order'}
              <span aria-hidden="true">↗</span>
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
