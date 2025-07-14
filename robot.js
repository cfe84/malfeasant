const crypto = require('crypto');
const DatabaseAdapter = require('./database');

const SECONDS = 1000;

class RobotDetector {
  constructor(config = null) {
    this.config = config;
    this.db = new DatabaseAdapter(config);
    this.honeypotSecret = config?.security?.honeypotSecret || 'default-honeypot-secret';
    this.rateLimitShortWindow = config?.security?.rateLimitShortWindow || 60;
    
    this.knownBadAgents = new Set();
    this.knownGoodAgents = new Set();
    // In-memory storage for rate limiting
    this.userRequests = new Map(); // userId -> array of timestamps
    
    this.refreshKnownAgents();
    this.warmupRateCounters();
    this.initializeIntervals();
  }

  async initializeIntervals() {
    // Set up intervals with database-configured values
    const refreshInterval = await this.getKnownAgentsRefreshInterval();
    const cleanupInterval = await this.getRateCounterCleanupInterval();
    
    // Refresh known agents at configured interval
    setInterval(() => {
      this.refreshKnownAgents();
    }, refreshInterval);
    
    // Clean up old rate limit entries at configured interval
    setInterval(() => {
      this.cleanupRateCounters();
    }, cleanupInterval);
  }

  // Warm up rate counters from database on startup
  async warmupRateCounters() {
    try {
      const rateLimitWindow = await this.getRateLimitWindow();
      const windowAgo = new Date(Date.now() - rateLimitWindow);
      
      const result = await this.db.query(
        `SELECT user_id, created_at FROM request_logs 
         WHERE created_at > ? 
         AND (request_url LIKE '%.html' OR request_url = '/' OR request_url NOT LIKE '%.%')
         AND request_url NOT LIKE '/api/%' 
         AND request_url != '/dashboard.html' 
         AND request_url != '/dashboard'
         ORDER BY created_at DESC`,
        [windowAgo.toISOString()]
      );
      
      // Group requests by user ID
      for (const row of result.rows) {
        const userId = row.user_id;
        const timestamp = new Date(row.created_at).getTime();
        
        if (!this.userRequests.has(userId)) {
          this.userRequests.set(userId, []);
        }
        this.userRequests.get(userId).push(timestamp);
      }
      
      console.log(`Warmed up rate counters for ${this.userRequests.size} users with ${result.rows.length} recent requests`);
    } catch (error) {
      console.error('Error warming up rate counters:', error);
    }
  }

  // Clean up old entries from rate counters
  cleanupRateCounters() {
    const oneMinuteAgo = Date.now() - this.rateLimitShortWindow * SECONDS;
    let cleanedUsers = 0;
    
    for (const [userId, timestamps] of this.userRequests.entries()) {
      // Filter out old timestamps
      const recentTimestamps = timestamps.filter(ts => ts > oneMinuteAgo);
      
      if (recentTimestamps.length === 0) {
        this.userRequests.delete(userId);
        cleanedUsers++;
      } else {
        this.userRequests.set(userId, recentTimestamps);
      }
    }
    
    if (cleanedUsers > 0) {
      console.log(`Cleaned up rate counters for ${cleanedUsers} inactive users`);
    }
  }

  // Refresh the list of known bad and good user agents from database
  async refreshKnownAgents() {
    try {
      // Load bad agents
      const badAgentsResult = await this.db.query('SELECT user_agent FROM known_bad_agents WHERE is_active = ?', [true]);
      this.knownBadAgents = new Set(badAgentsResult.rows.map(row => row.user_agent.toLowerCase()));
      
      // Load good agents
      const goodAgentsResult = await this.db.query('SELECT user_agent FROM known_good_agents WHERE is_active = ?', [true]);
      this.knownGoodAgents = new Set(goodAgentsResult.rows.map(row => row.user_agent.toLowerCase()));
      
      console.log(`Refreshed ${this.knownBadAgents.size} known bad agents and ${this.knownGoodAgents.size} known good agents`);
    } catch (error) {
      console.error('Error refreshing known agents:', error);
    }
  }

  // Generate a user ID based on user agent and IP address
  generateUserId(userAgent, ipAddress) {
    const hash = crypto.createHash('sha256');
    hash.update(userAgent + ipAddress + this.honeypotSecret);
    return hash.digest('hex').substring(0, 16);
  }

  // Check if user agent is in known bad agents list
  isKnownBadAgent(userAgent) {
    const lowercaseUserAgent = userAgent.toLowerCase();
    // Check if any of the known bad agent patterns are contained in the user agent
    for (const badAgent of this.knownBadAgents) {
      if (lowercaseUserAgent.includes(badAgent)) {
        return true;
      }
    }
    return false;
  }

  // Check if user agent is in known good agents list
  isKnownGoodAgent(userAgent) {
    return this.knownGoodAgents.has(userAgent.toLowerCase());
  }

  // Check rate limits for a user using in-memory storage
  async checkRateLimits(userId) {
    const now = Date.now();
    const rateLimitWindow = await this.getRateLimitWindow();
    const rateLimitMax = await this.getRateLimitMax();
    const windowAgo = now - rateLimitWindow;

    // Get user's timestamps, filter to recent ones
    const userTimestamps = this.userRequests.get(userId) || [];
    const recentTimestamps = userTimestamps.filter(ts => ts > windowAgo);
    
    // Update the stored timestamps
    this.userRequests.set(userId, recentTimestamps);
    
    const shortCount = recentTimestamps.length;

    return {
      exceeded: shortCount > rateLimitMax,
      shortCount,
      shortLimit: rateLimitMax
    };
  }

  // Add a request timestamp to in-memory storage
  addRequestToCounter(userId) {
    if (!this.userRequests.has(userId)) {
      this.userRequests.set(userId, []);
    }
    this.userRequests.get(userId).push(Date.now());
  }

  // Log request to database (simplified - no more counter calculations)
  async logRequest(userId, userAgent, ipAddress, requestUrl, referrer, wasRedirected, blockReason = null) {
    try {
      const now = new Date();

      await this.db.query(
        `INSERT INTO request_logs 
         (user_id, user_agent, ip_address, request_url, referrer, was_request_redirected, block_reason, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, userAgent, ipAddress, requestUrl, referrer, wasRedirected ? 1 : 0, blockReason, now.toISOString()]
      );
    } catch (error) {
      console.error('Error logging request:', error);
    }
  }

  // Check if request is for HTML content
  isHtmlRequest(path) {
    return path === '/' || 
           path.endsWith('.html') || 
           path.endsWith('.htm') || 
           path.endsWith('/') ||
           (!path.includes('.'));
  }

  // Check if request should be excluded from rate limiting
  isExcludedFromRateLimit(path) {
    // Exclude API endpoints and dashboard from rate limiting
    return path.startsWith('/api/') || 
           path === '/dashboard.html' || 
           path === '/dashboard' ||
           path.startsWith('/dashboard/');
  }

  // Main function to determine if request should be blocked/redirected
  async getContent(path, userAgent, ipAddress, referrer = '', queryParams = {}) {
    const userId = this.generateUserId(userAgent, ipAddress);
    let shouldScramble = false;
    let redirectReason = '';

    // Check for scramble parameter - always block if present
    if (queryParams.scramble !== undefined) {
      console.log(`Scramble parameter detected in request: ${path}`);
      shouldScramble = true;
      redirectReason = 'Scramble parameter detected';
    }
    // Check if it's an HTML request and not excluded from rate limiting
    else if (this.isHtmlRequest(path) && !this.isExcludedFromRateLimit(path)) {
      // Check if user agent is known good - bypass all restrictions
      if (this.isKnownGoodAgent(userAgent)) {
        // Good agents bypass all restrictions, don't count towards rate limits
        // Just log and continue
      }
      // Check if user agent is known bad
      else if (this.isKnownBadAgent(userAgent)) {
        shouldScramble = true;
        redirectReason = 'Known bad user agent';
      } else {
        // Check rate limits using in-memory storage
        const rateLimitCheck = await this.checkRateLimits(userId);
        if (rateLimitCheck.exceeded) {
          shouldScramble = true;
          redirectReason = `Rate limit exceeded: ${rateLimitCheck.shortCount}/${rateLimitCheck.shortLimit} (1min)`;
        } else {
          // Add this request to the counter only if it's an HTML request
          this.addRequestToCounter(userId);
        }
      }
    }

    // Log the request to database for analytics
    await this.logRequest(userId, userAgent, ipAddress, path, referrer, shouldScramble, redirectReason);

    return {
      shouldScramble,
      redirectReason,
      userId,
    };
  }

  // Honeypot Status Management
  
  async getHoneypotStatus() {
    try {
      const result = await this.db.query('SELECT value FROM settings WHERE key = ?', ['honeypot_enabled']);
      if (result.rows.length > 0) {
        return result.rows[0].value === 'true';
      }
      // Default to enabled if setting doesn't exist
      return true;
    } catch (error) {
      console.error('Error getting honeypot status:', error);
      return true; // Default to enabled on error
    }
  }

  async setHoneypotStatus(enabled) {
    try {
      const value = enabled ? 'true' : 'false';
      await this.db.query(`
        INSERT OR REPLACE INTO settings (key, value, updated_at) 
        VALUES ('honeypot_enabled', ?, datetime('now'))
      `, [value]);
      console.log(`Honeypot ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } catch (error) {
      console.error('Error setting honeypot status:', error);
      return false;
    }
  }

  // Settings Management
  
  async getSetting(key, defaultValue = null) {
    try {
      const result = await this.db.query('SELECT value FROM settings WHERE key = ?', [key]);
      if (result.rows.length > 0) {
        return result.rows[0].value;
      }
      return defaultValue;
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error);
      return defaultValue;
    }
  }

  async setSetting(key, value) {
    try {
      await this.db.query(`
        INSERT OR REPLACE INTO settings (key, value, updated_at) 
        VALUES (?, ?, datetime('now'))
      `, [key, value]);
      return true;
    } catch (error) {
      console.error(`Error setting ${key}:`, error);
      return false;
    }
  }

  async getAllSettings() {
    try {
      const result = await this.db.query('SELECT key, value FROM settings ORDER BY key');
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

  // Helper methods for specific settings with type conversion
  
  async getRateLimitWindow() {
    const value = await this.getSetting('rate_limit_short_window', '60');
    return parseInt(value) * 1000; // Convert to milliseconds
  }

  async getRateLimitMax() {
    const value = await this.getSetting('rate_limit_short_max', '10');
    return parseInt(value);
  }

  async getFakeServerHeader() {
    return await this.getSetting('fake_server_header', 'Apache-Coyote/1.1');
  }

  async getKnownAgentsRefreshInterval() {
    const value = await this.getSetting('known_agents_refresh_interval', '60');
    return parseInt(value) * 1000; // Convert to milliseconds
  }

  async getRateCounterCleanupInterval() {
    const value = await this.getSetting('rate_counter_cleanup_interval', '300');
    return parseInt(value) * 1000; // Convert to milliseconds
  }

  // API Implementations
  
  async getStats() {
    try {
      // Get total requests
      const totalRequests = await this.db.query('SELECT COUNT(*) as count FROM request_logs');
      
      // Get blocked requests
      const blockedRequests = await this.db.query('SELECT COUNT(*) as count FROM request_logs WHERE was_request_redirected = ?', [1]);
      
      // Get block reasons breakdown
      const blockReasons = await this.db.query(`
        SELECT block_reason, COUNT(*) as count 
        FROM request_logs 
        WHERE was_request_redirected = 1 AND block_reason IS NOT NULL
        GROUP BY block_reason 
        ORDER BY count DESC
      `);
      
      // Get top user agents
      const topUserAgents = await this.db.query(`
        SELECT user_agent, COUNT(*) as count 
        FROM request_logs 
        GROUP BY user_agent 
        ORDER BY count DESC 
        LIMIT 10
      `);
      
      // Get recent requests with block reasons
      const recentRequests = await this.db.query(`
        SELECT ip_address, user_agent, request_url, was_request_redirected, block_reason, created_at 
        FROM request_logs 
        WHERE request_url NOT LIKE '/api/%'
        ORDER BY created_at DESC 
        LIMIT 50
      `);

      return {
        totalRequests: parseInt(totalRequests.rows[0].count),
        blockedRequests: parseInt(blockedRequests.rows[0].count),
        blockReasons: blockReasons.rows,
        topUserAgents: topUserAgents.rows,
        recentRequests: recentRequests.rows
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  }

  async addBadAgent(userAgent) {
    try {
      if (!userAgent) {
        throw new Error('User agent is required');
      }

      if (db.dbType === 'sqlite') {
        await this.db.query(
          'INSERT OR REPLACE INTO known_bad_agents (user_agent, is_active) VALUES (?, ?)',
          [userAgent, 1]
        );
      } else {
        await this.db.query(
          'INSERT INTO known_bad_agents (user_agent, is_active) VALUES (?, ?) ON CONFLICT (user_agent) DO UPDATE SET is_active = ?',
          [userAgent, true, true]
        );
      }

      // Refresh the known agents cache
      await this.refreshKnownAgents();
      
      return { message: 'Bad user agent added successfully' };
    } catch (error) {
      console.error('Error adding bad user agent:', error);
      throw error;
    }
  }

  async getBadAgents() {
    try {
      const result = await this.db.query('SELECT id, user_agent, is_active, created_at FROM known_bad_agents ORDER BY created_at DESC');
      return { badAgents: result.rows };
    } catch (error) {
      console.error('Error getting bad agents:', error);
      throw error;
    }
  }

  async deleteBadAgent(id) {
    try {
      if (!id) {
        throw new Error('Agent ID is required');
      }

      await this.db.query('DELETE FROM known_bad_agents WHERE id = ?', [id]);
      
      // Refresh the known agents cache
      await this.refreshKnownAgents();
      
      return { message: 'Bad user agent deleted successfully' };
    } catch (error) {
      console.error('Error deleting bad user agent:', error);
      throw error;
    }
  }

  async updateBadAgent(id, isActive) {
    try {
      if (!id) {
        throw new Error('Agent ID is required');
      }

      const activeValue = db.dbType === 'sqlite' ? (isActive ? 1 : 0) : isActive;
      await this.db.query('UPDATE known_bad_agents SET is_active = ? WHERE id = ?', [activeValue, id]);
      
      // Refresh the known agents cache
      await this.refreshKnownAgents();
      
      return { message: 'Bad user agent updated successfully' };
    } catch (error) {
      console.error('Error updating bad user agent:', error);
      throw error;
    }
  }

  // Good Agents API Methods
  
  async addGoodAgent(userAgent) {
    try {
      if (!userAgent) {
        throw new Error('User agent is required');
      }

      if (db.dbType === 'sqlite') {
        await this.db.query(
          'INSERT OR REPLACE INTO known_good_agents (user_agent, is_active) VALUES (?, ?)',
          [userAgent, 1]
        );
      } else {
        await this.db.query(
          'INSERT INTO known_good_agents (user_agent, is_active) VALUES (?, ?) ON CONFLICT (user_agent) DO UPDATE SET is_active = ?',
          [userAgent, true, true]
        );
      }

      // Refresh the known agents cache
      await this.refreshKnownAgents();
      
      return { message: 'Good user agent added successfully' };
    } catch (error) {
      console.error('Error adding good user agent:', error);
      throw error;
    }
  }

  async getGoodAgents() {
    try {
      const result = await this.db.query('SELECT id, user_agent, is_active, created_at FROM known_good_agents ORDER BY created_at DESC');
      return { goodAgents: result.rows };
    } catch (error) {
      console.error('Error getting good agents:', error);
      throw error;
    }
  }

  async deleteGoodAgent(id) {
    try {
      if (!id) {
        throw new Error('Agent ID is required');
      }

      await this.db.query('DELETE FROM known_good_agents WHERE id = ?', [id]);
      
      // Refresh the known agents cache
      await this.refreshKnownAgents();
      
      return { message: 'Good user agent deleted successfully' };
    } catch (error) {
      console.error('Error deleting good user agent:', error);
      throw error;
    }
  }

  async updateGoodAgent(id, isActive) {
    try {
      if (!id) {
        throw new Error('Agent ID is required');
      }

      const activeValue = db.dbType === 'sqlite' ? (isActive ? 1 : 0) : isActive;
      await this.db.query('UPDATE known_good_agents SET is_active = ? WHERE id = ?', [activeValue, id]);
      
      // Refresh the known agents cache
      await this.refreshKnownAgents();
      
      return { message: 'Good user agent updated successfully' };
    } catch (error) {
      console.error('Error updating good user agent:', error);
      throw error;
    }
  }
}

module.exports = RobotDetector;
