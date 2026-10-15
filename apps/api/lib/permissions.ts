/**
 * Central role/permission model. `platformAdmin` has full control; other roles
 * map to explicit capabilities. Handlers and the web client share the same
 * capability names so nav/actions can be driven from one source of truth.
 */

export type Role =
  | 'platformAdmin'
  | 'owner'
  | 'distributor'
  | 'storeOwner'
  | 'customer'
  | 'driver';

export const ROLES: Role[] = [
  'platformAdmin',
  'owner',
  'distributor',
  'storeOwner',
  'customer',
  'driver'
];

const OWNER_CAPS = [
  'users.read',
  'users.write',
  'companies.read',
  'stores.read',
  'stores.write',
  'products.read',
  'products.write',
  'orders.read',
  'orders.write',
  'drivers.read',
  'drivers.write',
  'appointments.read',
  'appointments.write',
  'payments.read',
  'payments.write',
  'codes.read',
  'codes.write',
  'reports.read',
  'settings.write',
  'notifications.read',
  'payouts.read',
  'payouts.write'
];

const DISTRIBUTOR_CAPS = [
  'stores.read',
  'products.read',
  'orders.read',
  'codes.read',
  'codes.write',
  'reports.read',
  'notifications.read'
];

const STORE_OWNER_CAPS = [
  'stores.read',
  'stores.write',
  'products.read',
  'products.write',
  'orders.read',
  'orders.write',
  'appointments.read',
  'appointments.write',
  'reports.read',
  'notifications.read'
];

const CUSTOMER_CAPS = [
  'products.read',
  'stores.read',
  'orders.read',
  'orders.write',
  'appointments.read',
  'appointments.write',
  'notifications.read'
];

const DRIVER_CAPS = ['orders.read', 'notifications.read'];

const CAPABILITIES: Record<Role, string[]> = {
  platformAdmin: ['*'],
  owner: OWNER_CAPS,
  distributor: DISTRIBUTOR_CAPS,
  storeOwner: STORE_OWNER_CAPS,
  customer: CUSTOMER_CAPS,
  driver: DRIVER_CAPS
};

export function hasPermission(role: string, capability: string): boolean {
  const caps = CAPABILITIES[role as Role];
  if (!caps) return false;
  if (caps.includes('*')) return true;
  return caps.includes(capability);
}

export function capabilitiesFor(role: string): string[] {
  const caps = CAPABILITIES[role as Role];
  if (!caps) return [];
  if (caps.includes('*')) return ['*'];
  return caps;
}

export function isStaffRole(role: string): boolean {
  return ['platformAdmin', 'owner'].includes(role);
}
