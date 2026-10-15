import { createCrudHandler } from '../crudHandler';

export default createCrudHandler('Payment', {
  writeRoles: ['platformAdmin', 'owner', 'storeOwner', 'distributor', 'customer']
});
