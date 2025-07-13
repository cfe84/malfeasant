const DatabaseAdapter = require('../database');

async function testDatabaseInitialization() {
  console.log('Testing database initialization...');
  
  try {
    // Create a database adapter instance
    const db = new DatabaseAdapter();
    
    // This should trigger schema initialization if needed
    console.log('Testing a simple query to trigger schema check...');
    const result = await db.query('SELECT COUNT(*) as count FROM known_bad_agents');
    console.log(`Found ${result.rows[0].count} known bad agents in the database`);
    
    // Test that all expected tables exist
    const tables = ['known_bad_agents', 'request_logs', 'known_good_agents', 'settings'];
    
    for (const table of tables) {
      const checkSQL = db.dbType === 'sqlite'
        ? `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`
        : `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}'`;
      
      const tableResult = await db.query(checkSQL);
      if (tableResult.rows.length > 0) {
        console.log(`✓ Table '${table}' exists`);
      } else {
        console.log(`✗ Table '${table}' is missing`);
      }
    }
    
    // Test that default data was inserted
    const badAgentsResult = await db.query('SELECT COUNT(*) as count FROM known_bad_agents');
    const goodAgentsResult = await db.query('SELECT COUNT(*) as count FROM known_good_agents');
    const settingsResult = await db.query('SELECT COUNT(*) as count FROM settings');
    
    console.log(`Database contains:`);
    console.log(`- ${badAgentsResult.rows[0].count} bad user agents`);
    console.log(`- ${goodAgentsResult.rows[0].count} good user agents`);
    console.log(`- ${settingsResult.rows[0].count} settings`);
    
    await db.end();
    console.log('✓ Database initialization test completed successfully!');
    
  } catch (error) {
    console.error('Database initialization test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testDatabaseInitialization()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testDatabaseInitialization };
