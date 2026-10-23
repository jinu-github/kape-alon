import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminItemInputSchema, dietaryTagSchema } from '@kape/shared';
import type { AdminItemInput, MenuResponse } from '@kape/shared';
import { adminApi } from '../../lib/admin';
import { Sheet } from '../Sheet';
import { OptionEditor } from './OptionEditor';
export function ItemEditor({
  item,
  categories,
  onClose,
}: {
  item: MenuResponse['items'][number] | null;
  categories: MenuResponse['categories'];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<AdminItemInput>(
    item
      ? {
          categoryId: item.categoryId,
          name: item.name,
          description: item.description,
          imageUrl: item.imageUrl,
          priceCents: item.priceCents,
          tags: item.tags,
          available: item.available,
          sortOrder: item.sortOrder,
          options: item.options,
        }
      : {
          categoryId: categories[0]?.id ?? '',
          name: '',
          description: '',
          imageUrl: '',
          priceCents: 0,
          tags: [],
          available: true,
          sortOrder: 0,
          options: [],
        },
  );
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      const parsed = adminItemInputSchema.safeParse(draft);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((issue) => issue.path.join('.') + ': ' + issue.message)
            .join('; '),
        );
      return adminApi.item(item?.id, parsed.data);
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['staff', 'admin'] });
      void cache.invalidateQueries({ queryKey: ['menu'] });
      onClose();
    },
  });
  const field = <K extends keyof AdminItemInput>(
    key: K,
    value: AdminItemInput[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <Sheet title={item ? 'Edit menu item' : 'New menu item'} onClose={onClose}>
      <form
        className="sheet-content admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label>
          Name
          <input
            required
            maxLength={100}
            value={draft.name}
            onChange={(e) => field('name', e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            required
            maxLength={300}
            value={draft.description}
            onChange={(e) => field('description', e.target.value)}
          />
        </label>
        <div className="form-pair">
          <label>
            Price in cents
            <input
              type="number"
              required
              min={0}
              max={10000000}
              step={1}
              value={draft.priceCents}
              onChange={(e) => field('priceCents', e.target.valueAsNumber)}
            />
          </label>
          <label>
            Sort order
            <input
              type="number"
              min={0}
              required
              value={draft.sortOrder}
              onChange={(e) => field('sortOrder', e.target.valueAsNumber)}
            />
          </label>
        </div>
        <label>
          Category
          <select
            value={draft.categoryId}
            onChange={(e) => field('categoryId', e.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Image URL
          <input
            required
            type="url"
            value={draft.imageUrl}
            onChange={(e) => field('imageUrl', e.target.value)}
            placeholder="https://images.unsplash.com/…"
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.available}
            onChange={(e) => field('available', e.target.checked)}
          />
          Available for ordering
        </label>
        <fieldset>
          <legend>Dietary tags</legend>
          <div className="tag-checks">
            {dietaryTagSchema.options.map((tag) => (
              <label className="check-label" key={tag}>
                <input
                  type="checkbox"
                  checked={draft.tags.includes(tag)}
                  onChange={(e) =>
                    field(
                      'tags',
                      e.target.checked
                        ? [...draft.tags, tag]
                        : draft.tags.filter((value) => value !== tag),
                    )
                  }
                />
                {tag}
              </label>
            ))}
          </div>
        </fieldset>
        <OptionEditor
          groups={draft.options}
          onChange={(value) => field('options', value)}
        />
        {save.isError && (
          <p role="alert" className="error-message">
            {save.error.message}
          </p>
        )}
        <button className="button full" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save item'}
        </button>
      </form>
    </Sheet>
  );
}
