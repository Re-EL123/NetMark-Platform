import { createCrudHandler } from '../../lib/crudHandler';

export default createCrudHandler('Appointment', {
  writeRoles: ['platformAdmin', 'owner', 'storeOwner', 'distributor', 'customer']
});
