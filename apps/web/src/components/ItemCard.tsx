import type { MenuItem } from '@kape/shared';
import { formatMoney } from '@kape/shared';

export function ItemCard({
  item,
  onSelect,
}: {
  item: MenuItem;
  onSelect: () => void;
}) {
  return (
    <article className={'item-card' + (!item.available ? ' unavailable' : '')}>
      <div className="item-photo">
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden';
          }}
        />
        {!item.available && <span className="sold-out">Sold out for now</span>}
      </div>
      <div className="item-copy">
        <div className="item-heading">
          <h3>{item.name}</h3>
          <span>{formatMoney(item.priceCents)}</span>
        </div>
        <p>{item.description}</p>
        <div className="item-bottom">
          <div className="tags">
            {item.tags.map((tag) => (
              <span key={tag}>{tag.replace('-', ' ')}</span>
            ))}
          </div>
          <button
            className="add-button"
            disabled={!item.available}
            aria-label={'Customize ' + item.name}
            onClick={onSelect}
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}
