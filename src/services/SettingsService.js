/**
 * SettingsService - Handles configuration and settings management
 * Extracted from RobotDetector to follow Single Responsibility Principle
 */
class SettingsService {
  constructor(database) {
    this.database = database;
  }

  /**
   * Get a setting value from the database
   * @param {string} key - The setting key
   * @param {any} defaultValue - Default value if setting doesn't exist
   * @returns {Promise<any>} - The setting value
   */
  async getSetting(key, defaultValue = null) {
    try {
      const result = await this.database.query(
        'SELECT value FROM settings WHERE key = ?', 
        [key]
      );
      if (result.rows.length > 0) {
        return result.rows[0].value;
      }
      return defaultValue;
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Set a setting value in the database
   * @param {string} key - The setting key
   * @param {any} value - The setting value
   * @returns {Promise<boolean>} - True if successful
   */
  async setSetting(key, value) {
    try {
      if (this.database.dbType === 'sqlite') {
        await this.database.query(`
          INSERT OR REPLACE INTO settings (key, value, updated_at) 
          VALUES (?, ?, datetime('now'))
        `, [key, value]);
      } else {
        // PostgreSQL
        await this.database.query(`
          INSERT INTO settings (key, value, updated_at) 
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET 
            value = EXCLUDED.value, 
            updated_at = CURRENT_TIMESTAMP
        `, [key, value]);
      }
      return true;
    } catch (error) {
      console.error(`Error setting ${key}:`, error);
      return false;
    }
  }

  /**
   * Get all settings from the database
   * @returns {Promise<Object>} - Object with all settings as key-value pairs
   */
  async getAllSettings() {
    try {
      const result = await this.database.query(
        'SELECT key, value FROM settings ORDER BY key'
      );
      const settings = {};
      for (const row of result.rows) {
        settings[row.key] = row.value;
      }
      return settings;
    } catch (error) {
      console.error('Error getting all settings:', error);
      return {};
    }
  }

  /**
   * Delete a setting from the database
   * @param {string} key - The setting key to delete
   * @returns {Promise<boolean>} - True if successful
   */
  async deleteSetting(key) {
    try {
      await this.database.query('DELETE FROM settings WHERE key = ?', [key]);
      return true;
    } catch (error) {
      console.error(`Error deleting setting ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if a setting exists
   * @param {string} key - The setting key to check
   * @returns {Promise<boolean>} - True if setting exists
   */
  async hasSetting(key) {
    try {
      const result = await this.database.query(
        'SELECT 1 FROM settings WHERE key = ? LIMIT 1',
        [key]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error(`Error checking setting ${key}:`, error);
      return false;
    }
  }

  // Honeypot-specific settings with proper typing and validation

  /**
   * Get honeypot enabled status
   * @returns {Promise<boolean>} - True if honeypot is enabled
   */
  async getHoneypotStatus() {
    try {
      const result = await this.getSetting('honeypot_enabled', 'true');
      return result === 'true';
    } catch (error) {
      console.error('Error getting honeypot status:', error);
      return true; // Default to enabled on error
    }
  }

  /**
   * Set honeypot enabled status
   * @param {boolean} enabled - Whether honeypot should be enabled
   * @returns {Promise<boolean>} - True if successful
   */
  async setHoneypotStatus(enabled) {
    try {
      const value = enabled ? 'true' : 'false';
      const success = await this.setSetting('honeypot_enabled', value);
      
      if (success) {
        console.log(`Honeypot ${enabled ? 'enabled' : 'disabled'}`);
      }
      
      return success;
    } catch (error) {
      console.error('Error setting honeypot status:', error);
      return false;
    }
  }

  /**
   * Get rate limit window in milliseconds
   * @returns {Promise<number>} - Rate limit window
   */
  async getRateLimitWindow() {
    const value = await this.getSetting('rate_limit_short_window', '60');
    return parseInt(value) * 1000; // Convert to milliseconds
  }

  /**
   * Get rate limit maximum requests
   * @returns {Promise<number>} - Maximum requests allowed
   */
  async getRateLimitMax() {
    const value = await this.getSetting('rate_limit_short_max', '10');
    return parseInt(value);
  }

  /**
   * Get fake server header
   * @returns {Promise<string>} - Fake server header value
   */
  async getFakeServerHeader() {
    return await this.getSetting('fake_server_header', 'Apache-Coyote/1.1');
  }

  /**
   * Get known agents refresh interval in milliseconds
   * @returns {Promise<number>} - Refresh interval
   */
  async getKnownAgentsRefreshInterval() {
    const value = await this.getSetting('known_agents_refresh_interval', '60');
    return parseInt(value) * 1000; // Convert to milliseconds
  }

  /**
   * Get rate counter cleanup interval in milliseconds
   * @returns {Promise<number>} - Cleanup interval
   */
  async getRateCounterCleanupInterval() {
    const value = await this.getSetting('rate_counter_cleanup_interval', '300');
    return parseInt(value) * 1000; // Convert to milliseconds
  }

  /**
   * Set rate limit window
   * @param {number} seconds - Window in seconds
   * @returns {Promise<boolean>} - True if successful
   */
  async setRateLimitWindow(seconds) {
    return await this.setSetting('rate_limit_short_window', seconds.toString());
  }

  /**
   * Set rate limit maximum
   * @param {number} max - Maximum requests allowed
   * @returns {Promise<boolean>} - True if successful
   */
  async setRateLimitMax(max) {
    return await this.setSetting('rate_limit_short_max', max.toString());
  }

  /**
   * Set fake server header
   * @param {string} header - Server header value
   * @returns {Promise<boolean>} - True if successful
   */
  async setFakeServerHeader(header) {
    return await this.setSetting('fake_server_header', header);
  }

  /**
   * Validate setting value based on key
   * @param {string} key - Setting key
   * @param {any} value - Setting value to validate
   * @returns {boolean} - True if valid
   */
  validateSetting(key, value) {
    switch (key) {
      case 'honeypot_enabled':
        return value === 'true' || value === 'false';
      case 'rate_limit_short_window':
      case 'rate_limit_short_max':
      case 'known_agents_refresh_interval':
      case 'rate_counter_cleanup_interval':
        const num = parseInt(value);
        return !isNaN(num) && num > 0;
      case 'fake_server_header':
        return typeof value === 'string' && value.length > 0;
      default:
        return true; // Allow unknown settings
    }
  }

  /**
   * Set setting with validation
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   * @returns {Promise<boolean>} - True if successful
   */
  async setSettingWithValidation(key, value) {
    if (!this.validateSetting(key, value)) {
      throw new Error(`Invalid value for setting ${key}: ${value}`);
    }
    return await this.setSetting(key, value);
  }
}

module.exports = SettingsService;
