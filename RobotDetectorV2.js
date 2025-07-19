const ServiceContainer = require('./src/container/ServiceContainer');

/**
 * RobotDetectorV2 - Refactored version using clean architecture
 * Maintains backward compatibility with the original RobotDetector API
 * while using the new service-oriented architecture internally
 */
class RobotDetectorV2 {
  constructor(config = null) {
    this.config = config;
    this.container = new ServiceContainer(config);
    this.isInitialized = false;
    
    // Initialize the container
    this.initialize();
  }

  /**
   * Initialize the detector and all services
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.container.initialize();
      this.isInitialized = true;
      console.log('RobotDetectorV2 initialized successfully');
    } catch (error) {
      console.error('Error initializing RobotDetectorV2:', error);
      throw error;
    }
  }

  /**
   * Ensure the detector is initialized before proceeding
   */
  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  // ============================================
  // BACKWARD COMPATIBILITY METHODS
  // These maintain the exact same API as the original RobotDetector
  // ============================================

  /**
   * Main function to determine if request should be blocked/redirected
   * LEGACY API - maintained for backward compatibility
   */
  async getContent(path, userAgent, ipAddress, referrer = '', queryParams = {}) {
    await this.ensureInitialized();
    const honeypotService = this.container.get('honeypotService');
    return await honeypotService.getContent(path, userAgent, ipAddress, referrer, queryParams);
  }

  /**
   * Generate a user ID based on user agent and IP address
   * LEGACY API - maintained for backward compatibility
   */
  generateUserId(userAgent, ipAddress) {
    const honeypotService = this.container.get('honeypotService');
    return honeypotService.generateUserId(userAgent, ipAddress);
  }

  /**
   * Check if user agent is in known bad agents list
   * LEGACY API - maintained for backward compatibility
   */
  isKnownBadAgent(userAgent) {
    const userAgentService = this.container.get('userAgentService');
    return userAgentService.isKnownBadAgent(userAgent);
  }

  /**
   * Check if user agent is in known good agents list
   * LEGACY API - maintained for backward compatibility
   */
  isKnownGoodAgent(userAgent) {
    const userAgentService = this.container.get('userAgentService');
    return userAgentService.isKnownGoodAgent(userAgent);
  }

  /**
   * Check rate limits for a user
   * LEGACY API - maintained for backward compatibility
   */
  async checkRateLimits(userId) {
    await this.ensureInitialized();
    const rateLimitService = this.container.get('rateLimitService');
    return await rateLimitService.checkRateLimits(userId);
  }

  /**
   * Add a request timestamp to in-memory storage
   * LEGACY API - maintained for backward compatibility
   */
  addRequestToCounter(userId) {
    const rateLimitService = this.container.get('rateLimitService');
    rateLimitService.addRequestToCounter(userId);
  }

  /**
   * Log request to database
   * LEGACY API - maintained for backward compatibility
   */
  async logRequest(userId, userAgent, ipAddress, requestUrl, referrer, wasRedirected, blockReason = null) {
    await this.ensureInitialized();
    const requestLogService = this.container.get('requestLogService');
    return await requestLogService.logRequest(userId, userAgent, ipAddress, requestUrl, referrer, wasRedirected, blockReason);
  }

  /**
   * Check if request is for HTML content
   * LEGACY API - maintained for backward compatibility
   */
  isHtmlRequest(path) {
    const rateLimitService = this.container.get('rateLimitService');
    return rateLimitService.isHtmlRequest(path);
  }

  /**
   * Check if request should be excluded from rate limiting
   * LEGACY API - maintained for backward compatibility
   */
  isExcludedFromRateLimit(path) {
    const rateLimitService = this.container.get('rateLimitService');
    return rateLimitService.isExcludedFromRateLimit(path);
  }

  // Honeypot Status Management
  async getHoneypotStatus() {
    await this.ensureInitialized();
    const settingsService = this.container.get('settingsService');
    return await settingsService.getHoneypotStatus();
  }

  async setHoneypotStatus(enabled) {
    await this.ensureInitialized();
    const settingsService = this.container.get('settingsService');
    return await settingsService.setHoneypotStatus(enabled);
  }

  // Settings Management
  async getSetting(key, defaultValue = null) {
    await this.ensureInitialized();
    const settingsService = this.container.get('settingsService');
    return await settingsService.getSetting(key, defaultValue);
  }

  async setSetting(key, value) {
    await this.ensureInitialized();
    const settingsService = this.container.get('settingsService');
    return await settingsService.setSetting(key, value);
  }

  async getAllSettings() {
    await this.ensureInitialized();
    const settingsService = this.container.get('settingsService');
    return await settingsService.getAllSettings();
  }

  // Helper methods for specific settings
  async getRateLimitWindow() {
    await this.ensureInitialized();
    const settingsService = this.container.get('settingsService');
    return await settingsService.getRateLimitWindow();
  }

  async getRateLimitMax() {
    await this.ensureInitialized();
    const settingsService = this.container.get('settingsService');
    return await settingsService.getRateLimitMax();
  }

  async getFakeServerHeader() {
    await this.ensureInitialized();
    const settingsService = this.container.get('settingsService');
    return await settingsService.getFakeServerHeader();
  }

  async getKnownAgentsRefreshInterval() {
    await this.ensureInitialized();
    const settingsService = this.container.get('settingsService');
    return await settingsService.getKnownAgentsRefreshInterval();
  }

  async getRateCounterCleanupInterval() {
    await this.ensureInitialized();
    const settingsService = this.container.get('settingsService');
    return await settingsService.getRateCounterCleanupInterval();
  }

  // API Implementations
  async getStats() {
    await this.ensureInitialized();
    const honeypotService = this.container.get('honeypotService');
    return await honeypotService.getStats();
  }

  // Bad Agents API
  async addBadAgent(userAgent) {
    await this.ensureInitialized();
    const userAgentService = this.container.get('userAgentService');
    return await userAgentService.addBadAgent(userAgent);
  }

  async getBadAgents() {
    await this.ensureInitialized();
    const userAgentService = this.container.get('userAgentService');
    return await userAgentService.getBadAgents();
  }

  async deleteBadAgent(id) {
    await this.ensureInitialized();
    const userAgentService = this.container.get('userAgentService');
    return await userAgentService.deleteBadAgent(id);
  }

  async updateBadAgent(id, isActive) {
    await this.ensureInitialized();
    const userAgentService = this.container.get('userAgentService');
    return await userAgentService.updateBadAgent(id, isActive);
  }

  // Good Agents API
  async addGoodAgent(userAgent) {
    await this.ensureInitialized();
    const userAgentService = this.container.get('userAgentService');
    return await userAgentService.addGoodAgent(userAgent);
  }

  async getGoodAgents() {
    await this.ensureInitialized();
    const userAgentService = this.container.get('userAgentService');
    return await userAgentService.getGoodAgents();
  }

  async deleteGoodAgent(id) {
    await this.ensureInitialized();
    const userAgentService = this.container.get('userAgentService');
    return await userAgentService.deleteGoodAgent(id);
  }

  async updateGoodAgent(id, isActive) {
    await this.ensureInitialized();
    const userAgentService = this.container.get('userAgentService');
    return await userAgentService.updateGoodAgent(id, isActive);
  }

  // ============================================
  // NEW ENHANCED API METHODS
  // These provide additional functionality beyond the legacy API
  // ============================================

  /**
   * Process a request through the complete honeypot pipeline
   * Enhanced version that returns more detailed information
   */
  async processRequest(request) {
    await this.ensureInitialized();
    const honeypotService = this.container.get('honeypotService');
    return await honeypotService.processRequest(request);
  }

  /**
   * Get detailed analytics for a specific time period
   */
  async getAnalytics(hours = 24) {
    await this.ensureInitialized();
    const honeypotService = this.container.get('honeypotService');
    return await honeypotService.getAnalytics(hours);
  }

  /**
   * Perform maintenance tasks
   */
  async performMaintenance(options = {}) {
    await this.ensureInitialized();
    const honeypotService = this.container.get('honeypotService');
    return await honeypotService.performMaintenance(options);
  }

  /**
   * Check the health of the honeypot system
   */
  async healthCheck() {
    await this.ensureInitialized();
    const honeypotService = this.container.get('honeypotService');
    return await honeypotService.healthCheck();
  }

  /**
   * Refresh all cached data
   */
  async refreshCache() {
    await this.ensureInitialized();
    const honeypotService = this.container.get('honeypotService');
    return await honeypotService.refreshCache();
  }

  /**
   * Get the service container (for advanced usage)
   */
  getContainer() {
    return this.container;
  }

  /**
   * Get a specific service (for advanced usage)
   */
  getService(serviceName) {
    return this.container.get(serviceName);
  }

  /**
   * Dispose of all resources
   */
  async dispose() {
    if (this.container) {
      await this.container.dispose();
    }
    this.isInitialized = false;
  }

  // ============================================
  // INTERNAL METHODS (for compatibility with intervals)
  // ============================================

  /**
   * Refresh known agents - for backward compatibility with intervals
   * LEGACY API - maintained for backward compatibility
   */
  async refreshKnownAgents() {
    await this.ensureInitialized();
    const userAgentService = this.container.get('userAgentService');
    return await userAgentService.refreshKnownAgents();
  }

  /**
   * Clean up rate counters - for backward compatibility with intervals
   * LEGACY API - maintained for backward compatibility
   */
  cleanupRateCounters() {
    const rateLimitService = this.container.get('rateLimitService');
    rateLimitService.cleanupRateCounters();
  }

  /**
   * Warm up rate counters - for backward compatibility
   * LEGACY API - maintained for backward compatibility
   */
  async warmupRateCounters() {
    // This is now handled automatically during initialization
    await this.ensureInitialized();
  }

  /**
   * Initialize intervals - for backward compatibility
   * LEGACY API - maintained for backward compatibility
   */
  async initializeIntervals() {
    // This is now handled automatically during service initialization
    await this.ensureInitialized();
  }
}

module.exports = RobotDetectorV2;
