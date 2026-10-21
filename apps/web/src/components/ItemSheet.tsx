import { useState } from 'react';
import type { MenuItem } from '@kape/shared';
import { formatMoney } from '@kape/shared';
import { Sheet } from './Sheet';
import type { CartLine } from '../lib/cart';
import { linePrice } from '../lib/cart';

export function ItemSheet({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const [choiceIds, setChoiceIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const line: CartLine = { key: '', item, quantity: 1, choiceIds, notes };
  const valid =
    item.available &&
    item.options.every((group) => {
      const count = group.choices.filter((choice) =>
        choiceIds.includes(choice.id),
      ).length;
      return !group.available
        ? group.minSelections === 0
        : count >= group.minSelections && count <= group.maxSelections;
    });
  function toggle(groupId: string, choiceId: string, checked: boolean) {
    const group = item.options.find((option) => option.id === groupId);
    if (!group) return;
    setChoiceIds((current) => {
      const rest = current.filter(
        (id) =>
          id !== choiceId &&
          (group.maxSelections !== 1 ||
            !group.choices.some((choice) => choice.id === id)),
      );
      return checked ? [...rest, choiceId] : rest;
    });
  }
  return (
    <Sheet title="Make it yours" onClose={onClose}>
      <img className="detail-photo" src={item.imageUrl} alt="" />
      <div className="sheet-content">
        <h2>{item.name}</h2>
        <p className="muted">{item.description}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) onAdd({ ...line, key: crypto.randomUUID() });
          }}
        >
          {item.options.map((group) => (
            <fieldset key={group.id} disabled={!group.available}>
              <legend>
                {group.name}{' '}
                <small>
                  {group.minSelections > 0 ? 'Required' : 'Optional'} · choose{' '}
                  {group.maxSelections === 1
                    ? 'one'
                    : 'up to ' + group.maxSelections}
                </small>
              </legend>
              {!group.available && <p>Currently unavailable</p>}
              {group.choices.map((choice) => (
                <label className="choice" key={choice.id}>
                  <input
                    type="checkbox"
                    checked={choiceIds.includes(choice.id)}
                    disabled={!choice.available}
                    onChange={(event) =>
                      toggle(group.id, choice.id, event.target.checked)
                    }
                  />
                  <span>
                    {choice.name}
                    {!choice.available && ' · unavailable'}
                  </span>
                  <span>
                    {choice.priceCents
                      ? '+' + formatMoney(choice.priceCents)
                      : 'Included'}
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
          <label className="notes-label" htmlFor="item-notes">
            A little note for the kitchen <span>Optional</span>
          </label>
          <textarea
            id="item-notes"
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Less ice, sauce on the side…"
          />
          <p className="fine-print">
            For allergies, please speak with the cafe team before ordering.
          </p>
          {!valid && (
            <p className="fine-print" role="status">
              Choose the required options within the selection limits to
              continue.
            </p>
          )}
          <button className="button full" disabled={!valid}>
            Add to order <span>{formatMoney(linePrice(line))}</span>
          </button>
        </form>
      </div>
    </Sheet>
  );
}
