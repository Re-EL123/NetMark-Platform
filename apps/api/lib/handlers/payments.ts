import { createCrudHandler } from '../crudHandler';

export default createCrudHandler('payments', {
  writeRoles: ['platformAdmin', 'owner', 'storeOwner', 'distributor', 'customer']
});
