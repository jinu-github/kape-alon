import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { io } from 'socket.io-client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { formatMoney, tableNumberSchema } from '@kape/shared';
import type { MenuItem } from '@kape/shared';
import { api, apiOrigin, retryRead } from '../lib/api';
import { loadCart, linePrice } from '../lib/cart';
import type { CartLine } from '../lib/cart';
import { CafeShell } from '../components/CafeShell';
import { AsyncState } from '../components/AsyncState';
import { ItemCard } from '../components/ItemCard';
import { ItemSheet } from '../components/ItemSheet';
import { CartSheet } from '../components/CartSheet';

export function MenuPage() {
  const { tableNumber } = useParams();
  const number = Number(tableNumber);
  if (
    !/^[1-9]\d{0,2}$/.test(tableNumber ?? '') ||
    !tableNumberSchema.safeParse(number).success
  )
    return (
      <CafeShell>
        <main id="main">
          <AsyncState
            title="This table link isn’t quite right."
            error={
              new Error(
                'Scan the QR code on your table, or ask the cafe team for help.',
              )
            }
          />
        </main>
      </CafeShell>
    );
  return <TableMenu key={number} table={number} />;
}
function TableMenu({ table }: { table: number }) {
  const cache = useQueryClient();
  useEffect(() => {
    const socket = io(apiOrigin, { transports: ['polling', 'websocket'] });
    const refresh = () => {
      void cache.invalidateQueries({ queryKey: ['menu'] });
    };
    socket.on('connect', refresh);
    socket.on('menu:changed', refresh);
    return () => {
      socket.disconnect();
    };
  }, [cache]);
  const tableQuery = useQuery({
    queryKey: ['table', table],
    queryFn: () => api.table(table),
    retry: retryRead,
  });
  const menu = useQuery({
    queryKey: ['menu'],
    queryFn: api.menu,
    refetchInterval: 15000,
    enabled: tableQuery.isSuccess,
    retry: retryRead,
  });
  const [lines, setLines] = useState<CartLine[]>(() => loadCart(table));
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [lastOrder] = useState(() => {
    try {
      return localStorage.getItem('last-order:' + table);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('cart:' + table, JSON.stringify(lines));
    } catch {
      /* In-memory cart remains usable. */
    }
  }, [lines, table]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const sections = [
          ...document.querySelectorAll<HTMLElement>('.menu-category'),
        ];
        const tabs = document.querySelector<HTMLElement>('.category-tabs');
        let current = sections[0];
        for (const section of sections)
          if (
            section.getBoundingClientRect().top <=
            (tabs?.offsetHeight ?? 70) + 24
          )
            current = section;
        if (current) setActiveCategory(current.id.replace('category-', ''));
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [menu.data, search]);
  useEffect(() => {
    const tab = document.querySelector<HTMLElement>('.category-tabs .active');
    const nav = tab?.parentElement;
    if (tab && nav)
      nav.scrollTo({
        left: tab.offsetLeft - nav.offsetLeft - 12,
        behavior: 'smooth',
      });
  }, [activeCategory]);
  const total = lines.reduce(
    (sum, line) => sum + linePrice(line) * line.quantity,
    0,
  );
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const items =
    menu.data?.items.filter((item) =>
      (item.name + ' ' + item.description)
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  const error = tableQuery.error ?? menu.error;
  const data = menu.data;
  return (
    <CafeShell table={table}>
      <main id="main" className="menu-main">
        {error ? (
          <AsyncState
            error={error}
            onRetry={() => {
              void tableQuery.refetch();
              void menu.refetch();
            }}
          />
        ) : tableQuery.isPending || !data ? (
          <AsyncState loading />
        ) : (
          <>
            <section className="menu-hero">
              <div>
                <p className="eyebrow">SETTLE IN. YOU’RE IN GOOD COMPANY.</p>
                <h1>
                  A good day
                  <br />
                  starts here<span>.</span>
                </h1>
                <p>
                  Freshly brewed. Made with care.
                  <br />
                  Find a little something to brighten your day.
                </p>
              </div>
              <div className="hero-photo">
                <img src={data.items[0]?.imageUrl} alt="A warm cup of coffee" />
                <span className="hero-stamp">
                  SIP SLOWLY
                  <br />
                  <b>≈</b>
                  <br />
                  STAY AWHILE
                </span>
              </div>
            </section>
            <div className="menu-toolbar">
              <div>
                <p className="eyebrow">FROM OUR KITCHEN & COFFEE BAR</p>
                <h2>The menu</h2>
              </div>
              <label className="search-field">
                <span className="sr-only">Search the menu</span>
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find your favorite"
                />
              </label>
            </div>
            <nav className="category-tabs" aria-label="Menu categories">
              {data.categories.map((category, index) => (
                <a
                  key={category.id}
                  href={'#category-' + category.id}
                  className={
                    (activeCategory || data.categories[0]?.id) === category.id
                      ? 'active'
                      : ''
                  }
                  aria-current={
                    (activeCategory || data.categories[0]?.id) === category.id
                      ? 'location'
                      : undefined
                  }
                  onClick={() => setActiveCategory(category.id)}
                >
                  <span aria-hidden="true">
                    {['☕', '◒', '◡', '◇', '◉'][index]}
                  </span>
                  {category.name}
                </a>
              ))}
            </nav>
            {lastOrder && (
              <Link className="last-order" to={'/orders/' + lastOrder}>
                View your latest order <span aria-hidden="true">↗</span>
              </Link>
            )}
            {items.length === 0 && (
              <div className="state-panel">
                <h2>
                  {search
                    ? 'No matches just yet.'
                    : 'The menu is taking a little break.'}
                </h2>
                <p>
                  {search
                    ? 'Try another name, or explore a different category.'
                    : 'Please check back soon or ask the cafe team.'}
                </p>
                {search && (
                  <button className="button" onClick={() => setSearch('')}>
                    Clear search
                  </button>
                )}
              </div>
            )}
            {data.categories.map((category) => {
              const categoryItems = items.filter(
                (item) => item.categoryId === category.id,
              );
              if (!categoryItems.length) return null;
              return (
                <section
                  className="menu-category"
                  id={'category-' + category.id}
                  key={category.id}
                >
                  <div className="category-heading">
                    <h2>{category.name}</h2>
                    <span>{categoryItems.length} little reasons to stay</span>
                  </div>
                  <div className="menu-grid">
                    {categoryItems.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onSelect={() => setSelected(item)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            <div className="menu-note">
              <span aria-hidden="true">≈</span>
              <p>
                Good food is better shared.
                <br />
                <small>Questions about ingredients? We’re happy to help.</small>
              </p>
            </div>
          </>
        )}
        <p className="sr-only" role="status">
          {notice}
        </p>
      </main>
      {tableQuery.isSuccess && (
        <div className="cart-bar">
          <button className="button full" onClick={() => setCartOpen(true)}>
            <span className="cart-count">{count}</span>
            <span>View your order</span>
            <strong>{formatMoney(total)}</strong>
          </button>
        </div>
      )}
      {selected && (
        <ItemSheet
          item={selected}
          onClose={() => setSelected(null)}
          onAdd={(line) => {
            if (lines.length >= 30) {
              setNotice(
                'Your cart has reached 30 items. Please place this order first.',
              );
              setSelected(null);
              setCartOpen(true);
              return;
            }
            setLines((current) => [...current, line]);
            setNotice(line.item.name + ' added to your order.');
            setSelected(null);
          }}
        />
      )}
      {cartOpen && (
        <CartSheet
          table={table}
          lines={lines}
          onChange={setLines}
          onClose={() => setCartOpen(false)}
        />
      )}
    </CafeShell>
  );
}
