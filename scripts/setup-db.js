const db = require('../database');

async function setupDatabase() {
  try {
    console.log(`Setting up ${db.dbType.toUpperCase()} database tables...`);

    // Create known_bad_agents table
    if (db.dbType === 'sqlite') {
      await db.query(`
        CREATE TABLE IF NOT EXISTS known_bad_agents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_agent VARCHAR(500) UNIQUE NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create request_logs table
      await db.query(`
        CREATE TABLE IF NOT EXISTS request_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id VARCHAR(16) NOT NULL,
          user_agent TEXT,
          ip_address TEXT,
          request_url VARCHAR(2048),
          referrer VARCHAR(2048),
          was_request_redirected INTEGER DEFAULT 0,
          request_count_short_counter INTEGER DEFAULT 0,
          request_count_long_counter INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better performance
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_request_logs_user_id ON request_logs(user_id)
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at)
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_request_logs_user_id_created_at ON request_logs(user_id, created_at)
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_request_logs_ip_address ON request_logs(ip_address)
      `);
    } else {
      // PostgreSQL
      await db.query(`
        CREATE TABLE IF NOT EXISTS known_bad_agents (
          id SERIAL PRIMARY KEY,
          user_agent VARCHAR(500) UNIQUE NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create request_logs table
      await db.query(`
        CREATE TABLE IF NOT EXISTS request_logs (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(16) NOT NULL,
          user_agent TEXT,
          ip_address INET,
          request_url VARCHAR(2048),
          referrer VARCHAR(2048),
          was_request_redirected BOOLEAN DEFAULT false,
          request_count_short_counter INTEGER DEFAULT 0,
          request_count_long_counter INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better performance
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_request_logs_user_id ON request_logs(user_id)
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at)
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_request_logs_user_id_created_at ON request_logs(user_id, created_at)
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_request_logs_ip_address ON request_logs(ip_address)
      `);
    }

    // Insert some common bad user agents
    const badAgents = [
      'curl/',
      'wget/',
      'python-requests/',
      'urllib/',
      'scrapy/',
      'bot',
      'crawler',
      'spider',
      'scraper',
      'python/',
      'node-fetch/',
      'axios/',
      'okhttp/',
      'java/',
      'php/',
      'perl/',
      'ruby/',
      'go-http-client/',
      'libwww-perl/',
      'lwp-trivial/',
      'mechanize/',
      'selenium/',
      'headless'
    ];

    for (const agent of badAgents) {
      if (db.dbType === 'sqlite') {
        await db.query(`
          INSERT OR IGNORE INTO known_bad_agents (user_agent, is_active) 
          VALUES (?, ?)
        `, [agent, 1]);
      } else {
        await db.query(`
          INSERT INTO known_bad_agents (user_agent, is_active) 
          VALUES (?, ?) 
          ON CONFLICT (user_agent) DO NOTHING
        `, [agent, true]);
      }
    }

    console.log('Database setup completed successfully!');
    console.log(`- Created tables: known_bad_agents, request_logs`);
    console.log(`- Added ${badAgents.length} common bad user agents`);
    console.log('- Created performance indexes');

  } catch (error) {
    console.error('Error setting up database:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run the setup
setupDatabase().catch(console.error);
