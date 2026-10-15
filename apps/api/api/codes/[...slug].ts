import { createCrudHandler } from '../../lib/crudHandler';

export default createCrudHandler('DistributorCode', {
  writeRoles: ['platformAdmin', 'owner']
});
