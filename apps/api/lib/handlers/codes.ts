import { createCrudHandler } from '../crudHandler';

export default createCrudHandler('DistributorCode', {
  writeRoles: ['platformAdmin', 'owner']
});
