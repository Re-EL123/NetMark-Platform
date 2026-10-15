export const ROLES = {
  PLATFORM_ADMIN: 'platformAdmin',
  OWNER: 'owner',
  DISTRIBUTOR: 'distributor',
  STORE_OWNER: 'storeOwner',
  CUSTOMER: 'customer',
  DRIVER: 'driver'
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];
