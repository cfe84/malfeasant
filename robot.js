const crypto = require('crypto');
const db = require('./database');

const SECONDS = 1000;

class RobotDetector {
  constructor() {
    this.knownBadAgents = new Set();
    this.knownGoodAgents = new Set();
    // In-memory storage for rate limiting
    this.userRequests = new Map(); // userId -> array of timestamps
    
    this.refreshKnownAgents();
    this.warmupRateCounters();
    
    // Refresh known agents every minute
    setInterval(() => {
      this.refreshKnownAgents();
    }, parseInt(process.env.KNOWN_AGENTS_REFRESH_INTERVAL || 60) * SECONDS);
    
    // Clean up old rate limit entries every 5 minutes
    setInterval(() => {
      this.cleanupRateCounters();
    }, 5 * 60 * SECONDS);
  }

  // Warm up rate counters from database on startup
  async warmupRateCounters() {
    try {
      const oneMinuteAgo = new Date(Date.now() - parseInt(process.env.RATE_LIMIT_SHORT_WINDOW || 60) * SECONDS);
      
      const result = await db.query(
        `SELECT user_id, created_at FROM request_logs 
         WHERE created_at > ? 
         AND (request_url LIKE '%.html' OR request_url = '/' OR request_url NOT LIKE '%.%')
         AND request_url NOT LIKE '/api/%' 
         AND request_url != '/dashboard.html' 
         AND request_url != '/dashboard'
         ORDER BY created_at DESC`,
        [oneMinuteAgo.toISOString()]
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
    const oneMinuteAgo = Date.now() - parseInt(process.env.RATE_LIMIT_SHORT_WINDOW || 60) * SECONDS;
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
      const badAgentsResult = await db.query('SELECT user_agent FROM known_bad_agents WHERE is_active = ?', [true]);
      this.knownBadAgents = new Set(badAgentsResult.rows.map(row => row.user_agent.toLowerCase()));
      
      // Load good agents
      const goodAgentsResult = await db.query('SELECT user_agent FROM known_good_agents WHERE is_active = ?', [true]);
      this.knownGoodAgents = new Set(goodAgentsResult.rows.map(row => row.user_agent.toLowerCase()));
      
      console.log(`Refreshed ${this.knownBadAgents.size} known bad agents and ${this.knownGoodAgents.size} known good agents`);
    } catch (error) {
      console.error('Error refreshing known agents:', error);
    }
  }

  // Generate a user ID based on user agent and IP address
  generateUserId(userAgent, ipAddress) {
    const hash = crypto.createHash('sha256');
    hash.update(userAgent + ipAddress + process.env.HONEYPOT_SECRET);
    return hash.digest('hex').substring(0, 16);
  }

  // Check if user agent is in known bad agents list
  isKnownBadAgent(userAgent) {
    return this.knownBadAgents.has(userAgent.toLowerCase());
  }

  // Check if user agent is in known good agents list
  isKnownGoodAgent(userAgent) {
    return this.knownGoodAgents.has(userAgent.toLowerCase());
  }

  // Check rate limits for a user using in-memory storage
  checkRateLimits(userId) {
    const now = Date.now();
    const oneMinuteAgo = now - parseInt(process.env.RATE_LIMIT_SHORT_WINDOW || 60) * SECONDS;
    const shortLimit = parseInt(process.env.RATE_LIMIT_SHORT_MAX) || 10;

    // Get user's timestamps, filter to recent ones
    const userTimestamps = this.userRequests.get(userId) || [];
    const recentTimestamps = userTimestamps.filter(ts => ts > oneMinuteAgo);
    
    // Update the stored timestamps
    this.userRequests.set(userId, recentTimestamps);
    
    const shortCount = recentTimestamps.length;

    return {
      exceeded: shortCount > shortLimit,
      shortCount,
      shortLimit
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

      await db.query(
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
    return path === '/' || path.endsWith('.html') || path.endsWith('.htm') || 
           (!path.includes('.') && !path.endsWith('/'));
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
    let shouldRedirect = false;
    let shouldScramble = false;
    let redirectReason = '';

    // Check for scramble parameter - always block if present
    if (queryParams.scramble !== undefined) {
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
        const rateLimitCheck = this.checkRateLimits(userId);
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
    await this.logRequest(userId, userAgent, ipAddress, path, referrer, shouldScramble || shouldRedirect, redirectReason);

    return {
      shouldRedirect,
      shouldScramble,
      redirectReason,
      userId,
      redirectUrl: process.env.REDIRECT_URL || 'https://example.com/blocked'
    };
  }

  // API Implementations
  
  async getStats() {
    try {
      // Get total requests
      const totalRequests = await db.query('SELECT COUNT(*) as count FROM request_logs');
      
      // Get blocked requests
      const blockedRequests = await db.query('SELECT COUNT(*) as count FROM request_logs WHERE was_request_redirected = ?', [1]);
      
      // Get block reasons breakdown
      const blockReasons = await db.query(`
        SELECT block_reason, COUNT(*) as count 
        FROM request_logs 
        WHERE was_request_redirected = 1 AND block_reason IS NOT NULL
        GROUP BY block_reason 
        ORDER BY count DESC
      `);
      
      // Get top user agents
      const topUserAgents = await db.query(`
        SELECT user_agent, COUNT(*) as count 
        FROM request_logs 
        GROUP BY user_agent 
        ORDER BY count DESC 
        LIMIT 10
      `);
      
      // Get recent requests with block reasons
      const recentRequests = await db.query(`
        SELECT ip_address, user_agent, request_url, was_request_redirected, block_reason, created_at 
        FROM request_logs 
        ORDER BY created_at DESC 
        LIMIT 20
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
        await db.query(
          'INSERT OR REPLACE INTO known_bad_agents (user_agent, is_active) VALUES (?, ?)',
          [userAgent, 1]
        );
      } else {
        await db.query(
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
      const result = await db.query('SELECT id, user_agent, is_active, created_at FROM known_bad_agents ORDER BY created_at DESC');
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

      await db.query('DELETE FROM known_bad_agents WHERE id = ?', [id]);
      
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
      await db.query('UPDATE known_bad_agents SET is_active = ? WHERE id = ?', [activeValue, id]);
      
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
        await db.query(
          'INSERT OR REPLACE INTO known_good_agents (user_agent, is_active) VALUES (?, ?)',
          [userAgent, 1]
        );
      } else {
        await db.query(
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
      const result = await db.query('SELECT id, user_agent, is_active, created_at FROM known_good_agents ORDER BY created_at DESC');
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

      await db.query('DELETE FROM known_good_agents WHERE id = ?', [id]);
      
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
      await db.query('UPDATE known_good_agents SET is_active = ? WHERE id = ?', [activeValue, id]);
      
      // Refresh the known agents cache
      await this.refreshKnownAgents();
      
      return { message: 'Good user agent updated successfully' };
    } catch (error) {
      console.error('Error updating good user agent:', error);
      throw error;
    }
  }
}

module.exports = new RobotDetector();
