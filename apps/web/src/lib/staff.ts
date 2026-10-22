import { z } from 'zod';
import {
  staffUserSchema,
  demoAccessSchema,
  orderResponseSchema,
} from '@kape/shared';
import type { OrderStatus } from '@kape/shared';
import { request } from './api';

export const staffApi = {
  me: () => request('/me', staffUserSchema),
  admin: () => request('/admin/access', staffUserSchema),
  demo: (role: 'admin' | 'kitchen') =>
    request('/demo-access/' + role, demoAccessSchema),
  login: (email: string, password: string) =>
    request('/login', staffUserSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    request('/logout', z.void(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
  orders: () => request('/kitchen/orders', z.array(orderResponseSchema)),
  status: (id: string, status: OrderStatus) =>
    request('/kitchen/orders/' + id + '/status', orderResponseSchema, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
};
