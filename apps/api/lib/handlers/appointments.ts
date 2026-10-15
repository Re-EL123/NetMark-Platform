import { createCrudHandler } from '../crudHandler';

export default createCrudHandler('appointments', {
  writeRoles: ['platformAdmin', 'owner', 'storeOwner', 'distributor', 'customer']
});
