import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoryInputSchema, formatMoney } from '@kape/shared';
import type { MenuResponse } from '@kape/shared';
import { adminApi } from '../../lib/admin';
import { retryRead } from '../../lib/api';
import { AsyncState } from '../AsyncState';
import { Sheet } from '../Sheet';
import { ItemEditor } from './ItemEditor';
export function AdminMenu() {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['staff', 'admin', 'menu'],
    queryFn: adminApi.menu,
    retry: retryRead,
  });
  const [edit, setEdit] = useState<
    MenuResponse['items'][number] | null | undefined
  >();
  const [deleting, setDeleting] = useState<{
    id: string;
    name: string;
    kind: 'item' | 'category';
  } | null>(null);
  const remove = useMutation({
    mutationFn: async () => {
      if (deleting)
        await (deleting.kind === 'item'
          ? adminApi.deleteItem(deleting.id)
          : adminApi.deleteCategory(deleting.id));
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['staff', 'admin'] });
      setDeleting(null);
    },
  });
  if (query.isPending) return <AsyncState loading />;
  if (query.isError)
    return (
      <AsyncState error={query.error} onRetry={() => void query.refetch()} />
    );
  const data = query.data;
  return (
    <section>
      <div className="admin-section-heading">
        <h2>Menu management</h2>
        <button
          className="button"
          disabled={!data.categories.length}
          onClick={() => setEdit(null)}
        >
          Add item
        </button>
      </div>
      <details className="admin-panel">
        <summary>Manage categories ({data.categories.length})</summary>
        <p>Move or delete a category’s items before deleting the category.</p>
        {data.categories.map((category) => (
          <CategoryForm
            key={category.id + category.name + category.sortOrder}
            category={category}
            onDelete={() => {
              remove.reset();
              setDeleting({ ...category, kind: 'category' });
            }}
          />
        ))}
        <CategoryForm />
      </details>
      {!data.categories.length && (
        <p>Add a category first to start your menu.</p>
      )}
      {!data.items.length ? (
        <p className="admin-panel">
          No menu items yet. Add your first item above.
        </p>
      ) : (
        <div className="admin-item-grid">
          {data.items.map((item) => (
            <article
              className="admin-item"
              key={item.id}
              data-testid={'admin-item-' + item.id}
            >
              <img src={item.imageUrl} alt="" loading="lazy" />
              <div>
                <h3>{item.name}</h3>
                <p>
                  {formatMoney(item.priceCents)} ·{' '}
                  {item.available ? 'Available' : 'Sold out'}
                </p>
                <p className="fine-print">
                  {
                    data.categories.find(
                      (category) => category.id === item.categoryId,
                    )?.name
                  }
                </p>
                <div className="admin-actions">
                  <button
                    onClick={() => setEdit(item)}
                    aria-label={'Edit ' + item.name}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      remove.reset();
                      setDeleting({
                        id: item.id,
                        name: item.name,
                        kind: 'item',
                      });
                    }}
                    aria-label={'Delete ' + item.name}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {edit !== undefined && (
        <ItemEditor
          item={edit}
          categories={data.categories}
          onClose={() => setEdit(undefined)}
        />
      )}
      {deleting && (
        <Sheet title="Confirm deletion" onClose={() => setDeleting(null)}>
          <div className="sheet-content">
            <h2>Delete {deleting.name}?</h2>
            <p>
              Existing order receipts are preserved. This removes the{' '}
              {deleting.kind} from the menu.
            </p>
            {remove.isError && <p role="alert">{remove.error.message}</p>}
            <div className="admin-actions">
              <button
                className="button danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {remove.isPending ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button onClick={() => setDeleting(null)}>Keep it</button>
            </div>
          </div>
        </Sheet>
      )}
    </section>
  );
}
function CategoryForm({
  category,
  onDelete,
}: {
  category?: MenuResponse['categories'][number];
  onDelete?: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [sortOrder, setSortOrder] = useState(category?.sortOrder ?? 0);
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      adminApi.category(
        category?.id,
        categoryInputSchema.parse({ name, sortOrder }),
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['staff', 'admin', 'menu'] });
      if (!category) {
        setName('');
        setSortOrder(0);
      }
    },
  });
  return (
    <form
      className="category-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label>
        {category ? 'Category name' : 'New category name'}
        <input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Sort order
        <input
          type="number"
          min={0}
          required
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.valueAsNumber)}
        />
      </label>
      <button disabled={save.isPending}>
        {save.isPending
          ? 'Saving…'
          : category
            ? 'Save category'
            : 'Add category'}
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete}>
          Delete category
        </button>
      )}
      {save.isError && <p role="alert">{save.error.message}</p>}
      {save.isSuccess && <p role="status">Category saved.</p>}
    </form>
  );
}
