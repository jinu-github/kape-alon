import { z } from 'zod';
import {
  menuResponseSchema,
  dashboardSchema,
  historyResponseSchema,
  orderResponseSchema,
  adminSettingsSchema,
  adminCategorySchema,
} from '@kape/shared';
import type { AdminItemInput, HistoryFilter } from '@kape/shared';
import { request } from './api';
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
export const adminApi = {
  menu: () => request('/admin/menu', menuResponseSchema),
  dashboard: () => request('/admin/dashboard', dashboardSchema),
  settings: () => request('/admin/settings', adminSettingsSchema),
  history: (filter: HistoryFilter) =>
    request(
      '/admin/orders?' +
        new URLSearchParams(
          Object.entries(filter).map(([key, value]) => [key, String(value)]),
        ),
      historyResponseSchema,
    ),
  order: (id: string) => request('/admin/orders/' + id, orderResponseSchema),
  category: (
    id: string | undefined,
    body: { name: string; sortOrder: number },
  ) =>
    request(
      '/admin/categories' + (id ? '/' + id : ''),
      adminCategorySchema,
      json(id ? 'PUT' : 'POST', body),
    ),
  deleteCategory: (id: string) =>
    request('/admin/categories/' + id, z.void(), json('DELETE')),
  item: (id: string | undefined, body: AdminItemInput) =>
    request(
      '/admin/items' + (id ? '/' + id : ''),
      z.object({ id: z.uuid() }),
      json(id ? 'PUT' : 'POST', body),
    ),
  deleteItem: (id: string) =>
    request('/admin/items/' + id, z.void(), json('DELETE')),
  reset: () =>
    request(
      '/admin/reset',
      z.void(),
      json('POST', { confirmation: 'RESET DEMO DATA' }),
    ),
};
