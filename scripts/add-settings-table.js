const db = require('../database');

async function addSettingsTable() {
  try {
    console.log('Creating settings table...');
    
    // Create the settings table
    await db.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key VARCHAR(100) UNIQUE NOT NULL,
        value VARCHAR(500) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert default settings
    const defaultSettings = [
      ['honeypot_enabled', 'true'],
      ['rate_limit_short_window', '60'],
      ['rate_limit_short_max', '10'],
      ['fake_server_header', 'Apache-Coyote/1.1'],
      ['known_agents_refresh_interval', '60'],
      ['rate_counter_cleanup_interval', '300']
    ];
    
    for (const [key, value] of defaultSettings) {
      await db.query(`
        INSERT OR IGNORE INTO settings (key, value) 
        VALUES (?, ?)
      `, [key, value]);
    }
    
    console.log('Settings table created successfully!');
    console.log('Default settings added:');
    console.log('- honeypot_enabled: true');
    console.log('- rate_limit_short_window: 60 seconds');
    console.log('- rate_limit_short_max: 10 requests');
    console.log('- fake_server_header: Apache-Coyote/1.1');
    console.log('- known_agents_refresh_interval: 60 seconds');
    console.log('- rate_counter_cleanup_interval: 300 seconds (5 minutes)');
    
  } catch (error) {
    console.error('Error creating settings table:', error);
  } finally {
    process.exit(0);
  }
}

addSettingsTable();
