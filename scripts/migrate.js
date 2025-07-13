#!/usr/bin/env node

const DatabaseAdapter = require('../database');

/**
 * Migration script to update existing databases to the new consolidated schema
 * This script safely adds missing tables and columns without affecting existing data
 */
async function runMigration() {
  console.log('Starting database migration...');
  
  try {
    const db = new DatabaseAdapter();
    console.log(`Connected to ${db.dbType.toUpperCase()} database`);
    
    // Force schema initialization - this will create missing tables and add default data
    await db.initializeSchema();
    
    // Additional migration steps for existing databases
    await addMissingColumns(db);
    
    console.log('✓ Database migration completed successfully!');
    
    // Show final state
    await showDatabaseState(db);
    
    await db.end();
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

async function addMissingColumns(db) {
  try {
    // Check if block_reason column exists in request_logs
    const checkColumn = db.dbType === 'sqlite'
      ? "PRAGMA table_info(request_logs)"
      : "SELECT column_name FROM information_schema.columns WHERE table_name='request_logs' AND column_name='block_reason'";
    
    const result = await db.query(checkColumn);
    
    let hasBlockReason = false;
    if (db.dbType === 'sqlite') {
      // For SQLite, PRAGMA table_info returns an array of column information
      hasBlockReason = result.rows && result.rows.some(row => row.name === 'block_reason');
    } else {
      hasBlockReason = result.rows && result.rows.length > 0;
    }
    
    if (!hasBlockReason) {
      console.log('Adding block_reason column to request_logs table...');
      await db.execSQL('ALTER TABLE request_logs ADD COLUMN block_reason TEXT');
      console.log('✓ Added block_reason column');
    } else {
      console.log('✓ block_reason column already exists');
    }
    
  } catch (error) {
    if (error.message.includes('duplicate column') || 
        error.message.includes('already exists') ||
        error.message.includes('duplicate column name')) {
      console.log('✓ block_reason column already exists');
    } else {
      console.error('Error adding missing columns:', error);
      throw error;
    }
  }
}

async function showDatabaseState(db) {
  try {
    console.log('\nDatabase State Summary:');
    console.log('======================');
    
    const tables = [
      { name: 'known_bad_agents', description: 'Bad User Agents' },
      { name: 'known_good_agents', description: 'Good User Agents' },
      { name: 'request_logs', description: 'Request Logs' },
      { name: 'settings', description: 'Settings' }
    ];
    
    for (const table of tables) {
      try {
        const result = await db.query(`SELECT COUNT(*) as count FROM ${table.name}`);
        console.log(`- ${table.description}: ${result.rows[0].count} records`);
      } catch (error) {
        console.log(`- ${table.description}: Table missing or error`);
      }
    }
    
    // Show some sample settings
    console.log('\nCurrent Settings:');
    try {
      const settings = await db.query('SELECT key, value FROM settings ORDER BY key');
      settings.rows.forEach(setting => {
        console.log(`  ${setting.key}: ${setting.value}`);
      });
    } catch (error) {
      console.log('  Could not retrieve settings');
    }
    
  } catch (error) {
    console.error('Error showing database state:', error);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('\nMigration completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };
