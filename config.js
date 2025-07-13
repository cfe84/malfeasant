const path = require('path');
require('dotenv').config();

/**
 * Configuration module that resolves all environment variables
 * and provides them as a centralized configuration object
 */
class Config {
  constructor() {
    // Server configuration
    this.server = {
      port: parseInt(process.env.PORT) || 3000,
      nodeEnv: process.env.NODE_ENV || 'development',
      isDevelopment: process.env.NODE_ENV === 'development',
      apiSecret: process.env.API_SECRET
    };

    // Database configuration
    this.database = {
      type: process.env.DB_TYPE || 'sqlite',
      sqlite: {
        path: this.resolvePath(process.env.SQLITE_DB_PATH || './honeypot.db')
      },
      postgres: {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
      }
    };

    // Path configuration
    this.paths = {
      publicDir: this.resolvePath(process.env.PUBLIC_DIR || 'public'),
      honeypotStaticDir: this.resolvePath(process.env.HONEYPOT_STATIC_DIR || 'public'),
      blogStaticDir: this.resolvePath(process.env.BLOG_STATIC_DIR || 'blog'),
      custom404Page: process.env.CUSTOM_404_PAGE ? this.resolvePath(process.env.CUSTOM_404_PAGE) : null
    };

    // Route configuration
    this.routes = {
      blogRoutePrefix: process.env.BLOG_ROUTE_PREFIX || '/blog'
    };

    // Security configuration
    this.security = {
      honeypotSecret: process.env.HONEYPOT_SECRET || 'default-honeypot-secret',
      rateLimitShortWindow: parseInt(process.env.RATE_LIMIT_SHORT_WINDOW) || 60
    };
  }

  /**
   * Resolve path using path.resolve to support both relative and absolute paths
   * @param {string} inputPath - Input path (relative or absolute)
   * @returns {string} - Resolved absolute path
   */
  resolvePath(inputPath) {
    if (!inputPath) return null;
    
    // If it's already an absolute path, use it as-is
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }
    
    // Otherwise, resolve relative to current working directory
    return path.resolve(process.cwd(), inputPath);
  }

  /**
   * Get all configuration as a single object
   * @returns {object} - Complete configuration object
   */
  getAll() {
    return {
      server: this.server,
      database: this.database,
      paths: this.paths,
      routes: this.routes,
      security: this.security
    };
  }

  /**
   * Get database configuration for the active database type
   * @returns {object} - Database configuration
   */
  getDatabaseConfig() {
    const baseConfig = {
      type: this.database.type
    };

    if (this.database.type === 'postgres') {
      return {
        ...baseConfig,
        ...this.database.postgres
      };
    } else {
      return {
        ...baseConfig,
        path: this.database.sqlite.path
      };
    }
  }

  /**
   * Validate that required environment variables are set
   * @returns {object} - Validation result with any missing variables
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Check for critical missing variables
    if (this.server.nodeEnv === 'production') {
      if (!this.server.apiSecret) {
        errors.push('API_SECRET is required in production');
      }
      if (!this.security.honeypotSecret || this.security.honeypotSecret === 'default-honeypot-secret') {
        warnings.push('HONEYPOT_SECRET should be set to a unique value in production');
      }
    }

    // Check database configuration
    if (this.database.type === 'postgres') {
      const required = ['host', 'database', 'user'];
      required.forEach(field => {
        if (!this.database.postgres[field]) {
          errors.push(`DB_${field.toUpperCase()} is required when using postgres`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

module.exports = new Config();
