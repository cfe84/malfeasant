const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseAdapter {
  constructor(config = null) {
    const dbConfig = config?.getDatabaseConfig() || { type: 'sqlite', path: './honeypot.db' };
    this.dbType = dbConfig.type;
    this.dbConfig = dbConfig;
    this.schemaInitialized = false;
    this.initializeDatabase();
  }

  initializeDatabase() {
    if (this.dbType === 'postgres') {
      this.pool = new Pool({
        host: this.dbConfig.host,
        port: this.dbConfig.port,
        database: this.dbConfig.database,
        user: this.dbConfig.user,
        password: this.dbConfig.password,
      });

      this.pool.on('connect', () => {
        console.log('Connected to PostgreSQL database');
      });

      this.pool.on('error', (err) => {
        console.error('PostgreSQL connection error:', err);
      });
    } else {
      // SQLite
      const dbPath = this.dbConfig.path || './honeypot.db';
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('SQLite connection error:', err);
        } else {
          console.log('Connected to SQLite database');
        }
      });
    }
  }

  async ensureSchemaInitialized() {
    if (this.schemaInitialized) {
      return;
    }

    try {
      // Check if schema exists by looking for a key table
      const checkSQL = this.dbType === 'sqlite'
        ? "SELECT name FROM sqlite_master WHERE type='table' AND name='known_bad_agents'"
        : "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='known_bad_agents'";

      // Use direct query to avoid recursion
      const result = await this.directQuery(checkSQL);
      
      if (result.rows.length === 0) {
        console.log('Database schema not found. Initializing...');
        await this.initializeSchema();
      }
      
      this.schemaInitialized = true;
    } catch (error) {
      console.error('Error checking/initializing database schema:', error);
      throw error;
    }
  }

  // Direct query method that bypasses schema initialization check
  async directQuery(sql, params = []) {
    // Apply SQL adaptation for database-specific syntax
    const adaptedSQL = this.adaptSQL(sql);
    // Convert parameter values for database compatibility
    const adaptedParams = this.adaptParams(params);
    
    if (this.dbType === 'postgres') {
      return await this.pool.query(adaptedSQL, adaptedParams);
    } else {
      // SQLite
      return new Promise((resolve, reject) => {
        if (adaptedSQL.trim().toUpperCase().startsWith('SELECT') || adaptedSQL.trim().toUpperCase().startsWith('WITH')) {
          this.db.all(adaptedSQL, adaptedParams, (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve({ rows });
            }
          });
        } else {
          this.db.run(adaptedSQL, adaptedParams, function(err) {
            if (err) {
              reject(err);
            } else {
              resolve({ rowCount: this.changes, lastID: this.lastID });
            }
          });
        }
      });
    }
  }

  async initializeSchema() {
    const DatabaseInitializer = require('./scripts/init-database');
    const initializer = new DatabaseInitializer(this);
    await initializer.initializeSchema();
  }

  // Override query method to ensure schema is initialized
  async query(sql, params = []) {
    // Only check schema for non-system queries to avoid infinite recursion
    const isSystemQuery = sql.includes('sqlite_master') || 
                         sql.includes('information_schema') || 
                         sql.includes('PRAGMA');
    
    if (!isSystemQuery) {
      await this.ensureSchemaInitialized();
    }

    // directQuery already handles SQL adaptation
    return await this.directQuery(sql, params);
  }

  async end() {
    if (this.dbType === 'postgres') {
      await this.pool.end();
    } else {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) {
            console.error('Error closing SQLite database:', err);
          }
          resolve();
        });
      });
    }
  }

  // Convert SQL syntax between PostgreSQL and SQLite
  adaptSQL(sql) {
    if (this.dbType === 'sqlite') {
      // Convert PostgreSQL-specific syntax to SQLite
      return sql
        .replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
        .replace(/TIMESTAMP DEFAULT CURRENT_TIMESTAMP/g, 'DATETIME DEFAULT CURRENT_TIMESTAMP')
        .replace(/INET/g, 'TEXT')
        .replace(/BOOLEAN/g, 'INTEGER')
        .replace(/\$(\d+)/g, '?') // Convert $1, $2 to ?
        .replace(/ON CONFLICT \([^)]+\) DO UPDATE SET/g, 'ON CONFLICT DO UPDATE SET')
        .replace(/ON CONFLICT \([^)]+\) DO NOTHING/g, 'ON CONFLICT DO NOTHING')
        // Convert PostgreSQL boolean literals to SQLite integers
        .replace(/= true\b/g, '= 1')
        .replace(/= false\b/g, '= 0');
    } else if (this.dbType === 'postgres') {
      // Convert SQLite-specific syntax to PostgreSQL
      let adaptedSQL = sql
        .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
        .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/g, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
        .replace(/TEXT/g, 'TEXT') // TEXT is valid in both
        .replace(/INSERT OR IGNORE/g, 'INSERT')
        .replace(/ON CONFLICT DO UPDATE SET/g, 'ON CONFLICT DO UPDATE SET')
        .replace(/ON CONFLICT DO NOTHING/g, 'ON CONFLICT DO NOTHING')
        // Convert SQLite integer literals to PostgreSQL booleans for known boolean columns
        .replace(/was_request_redirected = 1\b/g, 'was_request_redirected = true')
        .replace(/was_request_redirected = 0\b/g, 'was_request_redirected = false')
        .replace(/is_active = 1\b/g, 'is_active = true')
        .replace(/is_active = 0\b/g, 'is_active = false');
      
      // Convert ? placeholders to $1, $2, etc. for PostgreSQL
      let paramIndex = 1;
      adaptedSQL = adaptedSQL.replace(/\?/g, () => `$${paramIndex++}`);
      
      return adaptedSQL;
    }
    return sql;
  }

  // Convert parameter values between PostgreSQL and SQLite
  adaptParams(params) {
    if (!params || params.length === 0) {
      return params;
    }

    return params.map(param => {
      if (this.dbType === 'postgres') {
        // Convert SQLite-style integers to PostgreSQL booleans
        if (param === 1) return true;
        if (param === 0) return false;
      } else if (this.dbType === 'sqlite') {
        // Convert PostgreSQL-style booleans to SQLite integers
        if (param === true) return 1;
        if (param === false) return 0;
      }
      return param;
    });
  }

  // Helper method to execute adapted SQL
  async execSQL(sql, params = []) {
    const adaptedSQL = this.adaptSQL(sql);
    return await this.query(adaptedSQL, params);
  }
}

module.exports = DatabaseAdapter;
