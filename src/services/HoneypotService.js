const crypto = require('crypto');
const DetectionResult = require('../models/DetectionResult');
const RequestLog = require('../models/RequestLog');

/**
 * HoneypotService - Main business logic orchestrator for the honeypot system
 * Coordinates between UserAgentService, RateLimitService, SettingsService, and RequestLogService
 */
class HoneypotService {
  constructor(userAgentService, rateLimitService, settingsService, requestLogService, config) {
    this.userAgentService = userAgentService;
    this.rateLimitService = rateLimitService;
    this.settingsService = settingsService;
    this.requestLogService = requestLogService;
    this.config = config;
    
    this.honeypotSecret = config?.security?.honeypotSecret || 'default-honeypot-secret';
  }

  /**
   * Initialize the honeypot service and all dependent services
   */
  async initialize() {
    console.log('Initializing HoneypotService...');
    
    // Initialize all dependent services
    await this.userAgentService.initialize();
    await this.rateLimitService.initialize();
    
    console.log('HoneypotService initialized successfully');
  }

  /**
   * Generate a user ID based on user agent and IP address
   * @param {string} userAgent - User agent string
   * @param {string} ipAddress - IP address
   * @returns {string} - Generated user ID
   */
  generateUserId(userAgent, ipAddress) {
    const hash = crypto.createHash('sha256');
    hash.update(userAgent + ipAddress + this.honeypotSecret);
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Analyze a request to determine if it should be blocked
   * @param {Object} request - Request object containing userAgent, ipAddress, path, referrer, queryParams
   * @returns {Promise<DetectionResult>} - Detection result
   */
  async analyzeRequest(request) {
    const { userAgent, ipAddress, path, queryParams = {} } = request;
    const userId = this.generateUserId(userAgent, ipAddress);

    try {
      // Check if honeypot is enabled
      const honeypotEnabled = await this.settingsService.getHoneypotStatus();
      if (!honeypotEnabled) {
        return DetectionResult.allowed(userId);
      }

      // Check for scramble parameter - always block if present
      if (queryParams.scramble !== undefined) {
        console.log(`Scramble parameter detected in request: ${path}`);
        return DetectionResult.scrambleParameter(userId);
      }

      // Only apply restrictions to HTML requests that aren't excluded
      if (!this.rateLimitService.isHtmlRequest(path) || 
          this.rateLimitService.isExcludedFromRateLimit(path)) {
        return DetectionResult.allowed(userId);
      }

      // Check if user agent is known good - bypass all restrictions
      if (this.userAgentService.isKnownGoodAgent(userAgent)) {
        // Good agents bypass all restrictions, don't count towards rate limits
        return DetectionResult.allowed(userId);
      }

      // Check if user agent is known bad
      if (this.userAgentService.isKnownBadAgent(userAgent)) {
        return DetectionResult.knownBadAgent(userId);
      }

      // Check rate limits
      const rateLimitResult = await this.rateLimitService.checkRateLimits(userId);
      if (rateLimitResult.exceeded) {
        return DetectionResult.rateLimitExceeded(
          userId, 
          rateLimitResult.shortCount, 
          rateLimitResult.shortLimit
        );
      }

      // Add this request to the counter for HTML requests
      this.rateLimitService.addRequestToCounter(userId);

      return DetectionResult.allowed(userId);

    } catch (error) {
      console.error('Error analyzing request:', error);
      // On error, default to allowing the request but log it
      return DetectionResult.allowed(userId);
    }
  }

  /**
   * Process a request through the complete honeypot pipeline
   * @param {Object} request - Request object
   * @returns {Promise<Object>} - Processing result with detection and logging info
   */
  async processRequest(request) {
    const detectionResult = await this.analyzeRequest(request);
    
    // Create and log the request
    const requestLog = RequestLog.fromDetectionResult(request, detectionResult);
    
    try {
      await this.requestLogService.logRequest(
        requestLog.userId,
        requestLog.userAgent,
        requestLog.ipAddress,
        requestLog.requestUrl,
        requestLog.referrer,
        requestLog.wasRedirected,
        requestLog.blockReason
      );
    } catch (error) {
      console.error('Error logging request:', error);
      // Don't fail the request processing if logging fails
    }

    return {
      detectionResult,
      requestLog,
      shouldScramble: detectionResult.shouldScramble,
      redirectReason: detectionResult.redirectReason,
      userId: detectionResult.userId
    };
  }

  /**
   * Get comprehensive statistics about the honeypot
   * @returns {Promise<Object>} - Statistics object
   */
  async getStats() {
    try {
      const requestStats = await this.requestLogService.getStats();
      const rateLimitStats = this.rateLimitService.getStats();
      const settings = await this.settingsService.getAllSettings();

      return {
        ...requestStats,
        rateLimiting: rateLimitStats,
        settings: {
          honeypotEnabled: await this.settingsService.getHoneypotStatus(),
          rateLimitWindow: await this.settingsService.getRateLimitWindow(),
          rateLimitMax: await this.settingsService.getRateLimitMax(),
          fakeServerHeader: await this.settingsService.getFakeServerHeader()
        },
        userAgents: {
          knownBadCount: this.userAgentService.knownBadAgents.size,
          knownGoodCount: this.userAgentService.knownGoodAgents.size
        }
      };
    } catch (error) {
      console.error('Error getting honeypot stats:', error);
      throw error;
    }
  }

  /**
   * Get detailed analytics for a specific time period
   * @param {number} hours - Number of hours to look back
   * @returns {Promise<Object>} - Detailed analytics
   */
  async getAnalytics(hours = 24) {
    try {
      const [blockedStats, volumeData, topAttackers] = await Promise.all([
        this.requestLogService.getBlockedRequestsStats(hours),
        this.requestLogService.getRequestVolumeOverTime(hours),
        this.requestLogService.getTopAttackingUserAgents(10, hours)
      ]);

      return {
        period: `${hours} hours`,
        blocked: blockedStats,
        volume: volumeData,
        topAttackers: topAttackers,
        rateLimiting: this.rateLimitService.getStats()
      };
    } catch (error) {
      console.error('Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * Refresh all cached data (user agents, settings, etc.)
   */
  async refreshCache() {
    try {
      await this.userAgentService.refreshKnownAgents();
      console.log('Honeypot cache refreshed successfully');
    } catch (error) {
      console.error('Error refreshing honeypot cache:', error);
      throw error;
    }
  }

  /**
   * Perform maintenance tasks (cleanup old data, refresh caches, etc.)
   * @param {Object} options - Maintenance options
   * @returns {Promise<Object>} - Maintenance results
   */
  async performMaintenance(options = {}) {
    const {
      cleanupOldLogs = true,
      daysToKeep = 30,
      refreshCache = true
    } = options;

    const results = {
      cleanupResults: null,
      cacheRefreshResults: null,
      errors: []
    };

    try {
      if (cleanupOldLogs) {
        const deletedCount = await this.requestLogService.cleanupOldLogs(daysToKeep);
        results.cleanupResults = { deletedLogCount: deletedCount };
      }

      if (refreshCache) {
        await this.refreshCache();
        results.cacheRefreshResults = { success: true };
      }

      // Clean up rate limit counters
      this.rateLimitService.cleanupRateCounters();

    } catch (error) {
      console.error('Error during maintenance:', error);
      results.errors.push(error.message);
    }

    return results;
  }

  /**
   * Check the health of the honeypot system
   * @returns {Promise<Object>} - Health check results
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {},
      errors: []
    };

    try {
      // Check if honeypot is enabled
      health.services.honeypot = {
        enabled: await this.settingsService.getHoneypotStatus(),
        status: 'ok'
      };

      // Check user agent service
      health.services.userAgents = {
        badAgentsCount: this.userAgentService.knownBadAgents.size,
        goodAgentsCount: this.userAgentService.knownGoodAgents.size,
        status: 'ok'
      };

      // Check rate limiting service
      const rateLimitStats = this.rateLimitService.getStats();
      health.services.rateLimiting = {
        activeUsers: rateLimitStats.totalActiveUsers,
        activeRequests: rateLimitStats.totalActiveRequests,
        status: 'ok'
      };

      // Check database connectivity by trying to get a setting
      await this.settingsService.getSetting('honeypot_enabled', 'true');
      health.services.database = { status: 'ok' };

    } catch (error) {
      health.status = 'unhealthy';
      health.errors.push(error.message);
      console.error('Health check failed:', error);
    }

    return health;
  }

  /**
   * Legacy compatibility method - matches old RobotDetector.getContent API
   * @param {string} path - Request path
   * @param {string} userAgent - User agent string
   * @param {string} ipAddress - IP address
   * @param {string} referrer - Referrer header
   * @param {Object} queryParams - Query parameters
   * @returns {Promise<Object>} - Legacy format response
   */
  async getContent(path, userAgent, ipAddress, referrer = '', queryParams = {}) {
    const request = {
      path,
      userAgent,
      ipAddress,
      referrer,
      queryParams
    };

    const result = await this.processRequest(request);
    
    // Return in legacy format for backward compatibility
    return {
      shouldScramble: result.shouldScramble,
      redirectReason: result.redirectReason,
      userId: result.userId
    };
  }
}

module.exports = HoneypotService;
