const db = require('../database');

async function addBlockReasonColumn() {
  try {
    console.log('Adding block_reason column to request_logs table...');
    
    if (db.dbType === 'sqlite') {
      // SQLite syntax
      await db.query(`
        ALTER TABLE request_logs 
        ADD COLUMN block_reason TEXT
      `);
    } else {
      // PostgreSQL syntax
      await db.query(`
        ALTER TABLE request_logs 
        ADD COLUMN block_reason TEXT
      `);
    }
    
    console.log('Block reason column added successfully!');
  } catch (error) {
    if (error.message.includes('duplicate column name') || 
        error.message.includes('already exists')) {
      console.log('Block reason column already exists, skipping...');
    } else {
      console.error('Error adding block reason column:', error);
      throw error;
    }
  }
}

if (require.main === module) {
  addBlockReasonColumn()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addBlockReasonColumn };
