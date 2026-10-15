import { createCrudHandler } from '../crudHandler';

export default createCrudHandler('Appointment', {
  writeRoles: ['platformAdmin', 'owner', 'storeOwner', 'distributor', 'customer']
});
