import { createCrudHandler } from '../../lib/crudHandler';

export default createCrudHandler('Payment', {
  writeRoles: ['platformAdmin', 'owner', 'storeOwner', 'distributor', 'customer']
});
