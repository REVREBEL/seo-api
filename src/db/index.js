import { pool, query, testConnection, closePool } from './postgres.js';

export { pool, query, testConnection, closePool };

export default {
  connect: () => pool.connect(),
  query,
  end: closePool,
};
