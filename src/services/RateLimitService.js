/**
 * RateLimitService - Handles rate limiting logic and in-memory request tracking
 * Extracted from RobotDetector to follow Single Responsibility Principle
 */
class RateLimitService {
  constructor(database, settingsService, config) {
    this.database = database;
    this.settingsService = settingsService;
    this.config = config;
    
    // In-memory storage for rate limiting
    this.userRequests = new Map(); // userId -> array of timestamps
    this.rateLimitShortWindow = config?.security?.rateLimitShortWindow || 60;
    
    this.initializeCleanupInterval();
  }

  /**
   * Initialize the service by warming up rate counters and setting up cleanup
   */
  async initialize() {
    await this.warmupRateCounters();
  }

  /**
   * Set up automatic cleanup of old rate limit entries
   */
  async initializeCleanupInterval() {
    const cleanupInterval = await this.getRateCounterCleanupInterval();
    
    // Clean up old rate limit entries at configured interval
    setInterval(() => {
      this.cleanupRateCounters();
    }, cleanupInterval);
  }

  /**
   * Warm up rate counters from database on startup
   */
  async warmupRateCounters() {
    try {
      const rateLimitWindow = await this.getRateLimitWindow();
      const windowAgo = new Date(Date.now() - rateLimitWindow);
      
      const result = await this.database.query(
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

  /**
   * Clean up old entries from rate counters
   */
  cleanupRateCounters() {
    const oneMinuteAgo = Date.now() - this.rateLimitShortWindow * 1000;
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

  /**
   * Check rate limits for a user using in-memory storage
   * @param {string} userId - The user ID to check
   * @returns {Promise<Object>} - Rate limit check result
   */
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

  /**
   * Add a request timestamp to in-memory storage
   * @param {string} userId - The user ID to add request for
   */
  addRequestToCounter(userId) {
    if (!this.userRequests.has(userId)) {
      this.userRequests.set(userId, []);
    }
    this.userRequests.get(userId).push(Date.now());
  }

  /**
   * Check if request should be excluded from rate limiting
   * @param {string} path - The request path
   * @returns {boolean} - True if should be excluded
   */
  isExcludedFromRateLimit(path) {
    // Exclude API endpoints and dashboard from rate limiting
    return path.startsWith('/api/') || 
           path === '/dashboard.html' || 
           path === '/dashboard' ||
           path.startsWith('/dashboard/');
  }

  /**
   * Check if request is for HTML content
   * @param {string} path - The request path
   * @returns {boolean} - True if it's an HTML request
   */
  isHtmlRequest(path) {
    return path === '/' || 
           path.endsWith('.html') || 
           path.endsWith('.htm') || 
           path.endsWith('/') ||
           (!path.includes('.'));
  }

  /**
   * Get rate limit window from settings
   * @returns {Promise<number>} - Rate limit window in milliseconds
   */
  async getRateLimitWindow() {
    const value = await this.settingsService.getSetting('rate_limit_short_window', '60');
    return parseInt(value) * 1000; // Convert to milliseconds
  }

  /**
   * Get rate limit maximum from settings
   * @returns {Promise<number>} - Maximum requests allowed
   */
  async getRateLimitMax() {
    const value = await this.settingsService.getSetting('rate_limit_short_max', '10');
    return parseInt(value);
  }

  /**
   * Get rate counter cleanup interval from settings
   * @returns {Promise<number>} - Cleanup interval in milliseconds
   */
  async getRateCounterCleanupInterval() {
    const value = await this.settingsService.getSetting('rate_counter_cleanup_interval', '300');
    return parseInt(value) * 1000; // Convert to milliseconds
  }

  /**
   * Get current rate limit statistics
   * @returns {Object} - Statistics about current rate limiting
   */
  getStats() {
    const totalUsers = this.userRequests.size;
    const totalRequests = Array.from(this.userRequests.values())
      .reduce((total, timestamps) => total + timestamps.length, 0);
    
    return {
      totalActiveUsers: totalUsers,
      totalActiveRequests: totalRequests,
      memoryUsage: {
        users: totalUsers,
        requests: totalRequests
      }
    };
  }
}

module.exports = RateLimitService;
