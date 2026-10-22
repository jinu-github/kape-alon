import type { z } from 'zod';
import {
  apiErrorSchema,
  menuResponseSchema,
  tableResponseSchema,
  orderResponseSchema,
} from '@kape/shared';
import type { CreateOrderInput } from '@kape/shared';

export const apiOrigin = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
).replace(/\/$/, '');
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiOrigin + path, {
      ...init,
      credentials: 'include',
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new ApiError(
      0,
      path === '/orders' && init?.method === 'POST'
        ? 'We could not confirm your order. Please check with the cafe team before trying again to avoid ordering twice.'
        : 'The cafe server is taking a moment. Please try again.',
    );
  }
  const body: unknown =
    response.status === 204 ? undefined : await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    throw new ApiError(
      response.status,
      error.success
        ? error.data.error.message
        : 'Something went wrong. Please try again.',
    );
  }
  return schema.parse(body);
}
export const api = {
  menu: () => request('/menu', menuResponseSchema),
  table: (number: number) => request('/tables/' + number, tableResponseSchema),
  order: (id: string) => request('/orders/' + id, orderResponseSchema),
  createOrder: (body: CreateOrderInput) =>
    request('/orders', orderResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};
export const retryRead = (count: number, error: Error) =>
  count < 2 &&
  (!(error instanceof ApiError) || error.status === 0 || error.status >= 500);
