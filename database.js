const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseAdapter {
  constructor(config = null) {
    const dbConfig = config?.getDatabaseConfig() || { type: 'sqlite', path: './honeypot.db' };
    this.dbType = dbConfig.type;
    this.dbConfig = dbConfig;
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

  async query(sql, params = []) {
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
