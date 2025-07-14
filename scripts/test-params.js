const DatabaseAdapter = require('../database');

async function testParameterConversion() {
  console.log('Testing parameter conversion for different database types...');
  
  const config = {
    getDatabaseConfig: () => ({ type: 'sqlite', path: './test-honeypot.db' })
  };
  
  const sqliteDB = new DatabaseAdapter(config);
  
  console.log('\nTesting SQLite parameter conversion:');
  const sqliteSQL = 'SELECT value FROM settings WHERE key = ?';
  const adaptedSQLite = sqliteDB.adaptSQL(sqliteSQL);
  console.log(`Original: ${sqliteSQL}`);
  console.log(`Adapted:  ${adaptedSQLite}`);
  
  // Test PostgreSQL parameter conversion
  const postgresConfig = {
    getDatabaseConfig: () => ({ 
      type: 'postgres', 
      host: 'localhost', 
      database: 'test', 
      user: 'test', 
      password: 'test' 
    })
  };
  
  console.log('\nTesting PostgreSQL parameter conversion:');
  // Create a mock PostgreSQL adapter to test conversion without connecting
  const mockPostgresDB = new DatabaseAdapter();
  mockPostgresDB.dbType = 'postgres';
  
  const postgresSQL = 'SELECT value FROM settings WHERE key = ?';
  const adaptedPostgres = mockPostgresDB.adaptSQL(postgresSQL);
  console.log(`Original: ${postgresSQL}`);
  console.log(`Adapted:  ${adaptedPostgres}`);
  
  const multiParamSQL = 'INSERT INTO settings (key, value) VALUES (?, ?)';
  const adaptedMultiParam = mockPostgresDB.adaptSQL(multiParamSQL);
  console.log(`\nMulti-param Original: ${multiParamSQL}`);
  console.log(`Multi-param Adapted:  ${adaptedMultiParam}`);
  
  await sqliteDB.end();
  console.log('\n✓ Parameter conversion test completed!');
}

testParameterConversion().catch(console.error);
