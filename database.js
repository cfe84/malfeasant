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
    if (this.dbType === 'postgres') {
      return await this.pool.query(sql, params);
    } else {
      // SQLite
      return new Promise((resolve, reject) => {
        if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('WITH')) {
          this.db.all(sql, params, (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve({ rows });
            }
          });
        } else {
          this.db.run(sql, params, function(err) {
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

  // Convert PostgreSQL syntax to SQLite where needed
  adaptSQL(sql) {
    if (this.dbType === 'sqlite') {
      // Convert PostgreSQL-specific syntax to SQLite
      return sql
        .replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
        .replace(/TIMESTAMP DEFAULT CURRENT_TIMESTAMP/g, 'DATETIME DEFAULT CURRENT_TIMESTAMP')
        .replace(/INET/g, 'TEXT')
        .replace(/\$(\d+)/g, '?') // Convert $1, $2 to ?
        .replace(/ON CONFLICT \([^)]+\) DO UPDATE SET/g, 'ON CONFLICT DO UPDATE SET')
        .replace(/ON CONFLICT \([^)]+\) DO NOTHING/g, 'ON CONFLICT DO NOTHING');
    }
    return sql;
  }

  // Helper method to execute adapted SQL
  async execSQL(sql, params = []) {
    const adaptedSQL = this.adaptSQL(sql);
    return await this.query(adaptedSQL, params);
  }
}

module.exports = DatabaseAdapter;
