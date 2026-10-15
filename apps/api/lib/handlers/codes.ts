import { createCrudHandler } from '../crudHandler';

export default createCrudHandler('distributor_codes', {
  writeRoles: ['platformAdmin', 'owner']
});
