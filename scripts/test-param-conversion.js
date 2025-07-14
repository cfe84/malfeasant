const DatabaseAdapter = require('../database');

async function testParameterConversionDetailed() {
  console.log('Testing detailed parameter conversion...');
  
  // Create a mock PostgreSQL adapter to test conversion
  const mockPostgresDB = new DatabaseAdapter();
  mockPostgresDB.dbType = 'postgres';
  
  const testCases = [
    {
      name: 'Single parameter query',
      sql: 'SELECT value FROM settings WHERE key = ?',
      expected: 'SELECT value FROM settings WHERE key = $1'
    },
    {
      name: 'Multi-parameter query', 
      sql: 'INSERT INTO settings (key, value) VALUES (?, ?)',
      expected: 'INSERT INTO settings (key, value) VALUES ($1, $2)'
    },
    {
      name: 'Complex query with multiple parameters',
      sql: 'SELECT user_agent FROM known_bad_agents WHERE is_active = ? AND user_agent LIKE ?',
      expected: 'SELECT user_agent FROM known_bad_agents WHERE is_active = $1 AND user_agent LIKE $2'
    },
    {
      name: 'Query with no parameters',
      sql: 'SELECT COUNT(*) as count FROM request_logs',
      expected: 'SELECT COUNT(*) as count FROM request_logs'
    }
  ];
  
  console.log('\nTesting PostgreSQL parameter conversion:');
  for (const testCase of testCases) {
    const adapted = mockPostgresDB.adaptSQL(testCase.sql);
    const passed = adapted === testCase.expected;
    console.log(`${passed ? '✓' : '✗'} ${testCase.name}`);
    if (!passed) {
      console.log(`  Expected: ${testCase.expected}`);
      console.log(`  Got:      ${adapted}`);
    }
  }
  
  // Test SQLite conversion (should not change ? parameters)
  const mockSQLiteDB = new DatabaseAdapter();
  mockSQLiteDB.dbType = 'sqlite';
  
  console.log('\nTesting SQLite parameter conversion (should preserve ?):');
  for (const testCase of testCases.slice(0, 2)) {
    const adapted = mockSQLiteDB.adaptSQL(testCase.sql);
    const passed = adapted === testCase.sql; // Should be unchanged
    console.log(`${passed ? '✓' : '✗'} ${testCase.name} (preserved)`);
    if (!passed) {
      console.log(`  Expected: ${testCase.sql}`);
      console.log(`  Got:      ${adapted}`);
    }
  }
  
  console.log('\n✓ Parameter conversion test completed!');
}

testParameterConversionDetailed().catch(console.error);
