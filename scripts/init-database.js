const DatabaseAdapter = require('../database');

class DatabaseInitializer {
  constructor(dbAdapter) {
    this.db = dbAdapter;
  }

  async initializeSchema() {
    try {
      console.log(`Initializing ${this.db.dbType.toUpperCase()} database schema...`);

      await this.createKnownBadAgentsTable();
      await this.createRequestLogsTable();
      await this.createKnownGoodAgentsTable();
      await this.createSettingsTable();
      await this.createIndexes();
      await this.insertDefaultData();

      console.log('Database schema initialization completed successfully!');
    } catch (error) {
      console.error('Error initializing database schema:', error);
      throw error;
    }
  }

  async createKnownBadAgentsTable() {
    const sql = this.db.dbType === 'sqlite' 
      ? `CREATE TABLE IF NOT EXISTS known_bad_agents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_agent VARCHAR(500) UNIQUE NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      : `CREATE TABLE IF NOT EXISTS known_bad_agents (
          id SERIAL PRIMARY KEY,
          user_agent VARCHAR(500) UNIQUE NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

    await this.db.directQuery(this.db.adaptSQL(sql));
    console.log('✓ Created known_bad_agents table');
  }

  async createRequestLogsTable() {
    const sql = this.db.dbType === 'sqlite'
      ? `CREATE TABLE IF NOT EXISTS request_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id VARCHAR(16) NOT NULL,
          user_agent TEXT,
          ip_address TEXT,
          request_url VARCHAR(2048),
          referrer VARCHAR(2048),
          was_request_redirected INTEGER DEFAULT 0,
          request_count_short_counter INTEGER DEFAULT 0,
          request_count_long_counter INTEGER DEFAULT 0,
          block_reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      : `CREATE TABLE IF NOT EXISTS request_logs (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(16) NOT NULL,
          user_agent TEXT,
          ip_address INET,
          request_url VARCHAR(2048),
          referrer VARCHAR(2048),
          was_request_redirected BOOLEAN DEFAULT false,
          request_count_short_counter INTEGER DEFAULT 0,
          request_count_long_counter INTEGER DEFAULT 0,
          block_reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

    await this.db.directQuery(this.db.adaptSQL(sql));
    console.log('✓ Created request_logs table');
  }

  async createKnownGoodAgentsTable() {
    const sql = this.db.dbType === 'sqlite'
      ? `CREATE TABLE IF NOT EXISTS known_good_agents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_agent VARCHAR(500) UNIQUE NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      : `CREATE TABLE IF NOT EXISTS known_good_agents (
          id SERIAL PRIMARY KEY,
          user_agent VARCHAR(500) UNIQUE NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

    await this.db.directQuery(this.db.adaptSQL(sql));
    console.log('✓ Created known_good_agents table');
  }

  async createSettingsTable() {
    const sql = this.db.dbType === 'sqlite'
      ? `CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key VARCHAR(100) UNIQUE NOT NULL,
          value VARCHAR(500) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      : `CREATE TABLE IF NOT EXISTS settings (
          id SERIAL PRIMARY KEY,
          key VARCHAR(100) UNIQUE NOT NULL,
          value VARCHAR(500) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

    await this.db.directQuery(this.db.adaptSQL(sql));
    console.log('✓ Created settings table');
  }

  async createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_request_logs_user_id ON request_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_request_logs_user_id_created_at ON request_logs(user_id, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_request_logs_ip_address ON request_logs(ip_address)'
    ];

    for (const indexSQL of indexes) {
      await this.db.directQuery(this.db.adaptSQL(indexSQL));
    }
    console.log('✓ Created performance indexes');
  }

  async insertDefaultData() {
    await this.insertDefaultBadAgents();
    await this.insertDefaultGoodAgents();
    await this.insertDefaultSettings();
  }

  async insertDefaultBadAgents() {
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

    const insertSQL = this.db.dbType === 'sqlite'
      ? 'INSERT OR IGNORE INTO known_bad_agents (user_agent, is_active) VALUES (?, ?)'
      : 'INSERT INTO known_bad_agents (user_agent, is_active) VALUES ($1, $2) ON CONFLICT (user_agent) DO NOTHING';

    for (const agent of badAgents) {
      const activeValue = this.db.dbType === 'sqlite' ? 1 : true;
      await this.db.directQuery(this.db.adaptSQL(insertSQL), [agent, activeValue]);
    }
    console.log(`✓ Added ${badAgents.length} default bad user agents`);
  }

  async insertDefaultGoodAgents() {
    const goodAgents = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Twitterbot/1.0',
      'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com/)',
      'WhatsApp/2.0'
    ];

    const insertSQL = this.db.dbType === 'sqlite'
      ? 'INSERT OR IGNORE INTO known_good_agents (user_agent, is_active) VALUES (?, ?)'
      : 'INSERT INTO known_good_agents (user_agent, is_active) VALUES ($1, $2) ON CONFLICT (user_agent) DO NOTHING';

    for (const agent of goodAgents) {
      const activeValue = this.db.dbType === 'sqlite' ? 1 : true;
      await this.db.directQuery(this.db.adaptSQL(insertSQL), [agent, activeValue]);
    }
    console.log(`✓ Added ${goodAgents.length} default good user agents`);
  }

  async insertDefaultSettings() {
    const defaultSettings = [
      ['honeypot_enabled', 'true'],
      ['rate_limit_short_window', '60'],
      ['rate_limit_short_max', '10'],
      ['fake_server_header', 'Apache-Coyote/1.1'],
      ['known_agents_refresh_interval', '60'],
      ['rate_counter_cleanup_interval', '300']
    ];

    const insertSQL = this.db.dbType === 'sqlite'
      ? 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
      : 'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING';

    for (const [key, value] of defaultSettings) {
      await this.db.directQuery(this.db.adaptSQL(insertSQL), [key, value]);
    }
    console.log(`✓ Added ${defaultSettings.length} default settings`);
  }

  async checkIfSchemaExists() {
    try {
      const checkSQL = this.db.dbType === 'sqlite'
        ? "SELECT name FROM sqlite_master WHERE type='table' AND name='known_bad_agents'"
        : "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='known_bad_agents'";

      const result = await this.db.directQuery(checkSQL);
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking schema existence:', error);
      return false;
    }
  }
}

module.exports = DatabaseInitializer;
