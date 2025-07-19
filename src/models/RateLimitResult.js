/**
 * RateLimitResult - Value object representing the result of rate limit checking
 * Encapsulates rate limit status and related metrics
 */
class RateLimitResult {
  constructor(exceeded, currentCount, limit, windowSize, userId) {
    this.exceeded = exceeded;
    this.currentCount = currentCount;
    this.limit = limit;
    this.windowSize = windowSize; // in milliseconds
    this.userId = userId;
    this.checkedAt = new Date();
  }

  /**
   * Create a rate limit result indicating limits are not exceeded
   * @param {string} userId - User ID
   * @param {number} currentCount - Current request count
   * @param {number} limit - Rate limit threshold
   * @param {number} windowSize - Window size in milliseconds
   * @returns {RateLimitResult} - Not exceeded result
   */
  static withinLimits(userId, currentCount, limit, windowSize) {
    return new RateLimitResult(false, currentCount, limit, windowSize, userId);
  }

  /**
   * Create a rate limit result indicating limits are exceeded
   * @param {string} userId - User ID
   * @param {number} currentCount - Current request count
   * @param {number} limit - Rate limit threshold
   * @param {number} windowSize - Window size in milliseconds
   * @returns {RateLimitResult} - Exceeded result
   */
  static limitsExceeded(userId, currentCount, limit, windowSize) {
    return new RateLimitResult(true, currentCount, limit, windowSize, userId);
  }

  /**
   * Check if rate limits are exceeded
   * @returns {boolean} - True if limits are exceeded
   */
  isExceeded() {
    return this.exceeded;
  }

  /**
   * Check if rate limits are within acceptable range
   * @returns {boolean} - True if within limits
   */
  isWithinLimits() {
    return !this.exceeded;
  }

  /**
   * Get the remaining requests before hitting the limit
   * @returns {number} - Number of remaining requests
   */
  getRemainingRequests() {
    return Math.max(0, this.limit - this.currentCount);
  }

  /**
   * Get the percentage of limit used
   * @returns {number} - Percentage (0-100)
   */
  getUsagePercentage() {
    if (this.limit === 0) return 0;
    return Math.round((this.currentCount / this.limit) * 100);
  }

  /**
   * Get the window size in seconds
   * @returns {number} - Window size in seconds
   */
  getWindowSizeSeconds() {
    return Math.round(this.windowSize / 1000);
  }

  /**
   * Get the window size in minutes
   * @returns {number} - Window size in minutes
   */
  getWindowSizeMinutes() {
    return Math.round(this.windowSize / (1000 * 60));
  }

  /**
   * Check if the user is approaching the rate limit (>80% usage)
   * @returns {boolean} - True if approaching limit
   */
  isApproachingLimit() {
    return this.getUsagePercentage() >= 80;
  }

  /**
   * Get a human-readable status message
   * @returns {string} - Status message
   */
  getStatusMessage() {
    if (this.isExceeded()) {
      return `Rate limit exceeded: ${this.currentCount}/${this.limit} requests in ${this.getWindowSizeSeconds()}s`;
    }
    
    if (this.isApproachingLimit()) {
      return `Approaching rate limit: ${this.currentCount}/${this.limit} requests in ${this.getWindowSizeSeconds()}s`;
    }
    
    return `Within rate limits: ${this.currentCount}/${this.limit} requests in ${this.getWindowSizeSeconds()}s`;
  }

  /**
   * Get rate limit headers for HTTP responses
   * @returns {Object} - Headers object
   */
  getHeaders() {
    return {
      'X-RateLimit-Limit': this.limit.toString(),
      'X-RateLimit-Remaining': this.getRemainingRequests().toString(),
      'X-RateLimit-Window': this.getWindowSizeSeconds().toString(),
      'X-RateLimit-Used': this.currentCount.toString()
    };
  }

  /**
   * Calculate when the window will reset (estimated)
   * @returns {Date} - Estimated reset time
   */
  getEstimatedResetTime() {
    // This is an approximation since we don't know exactly when the window started
    return new Date(this.checkedAt.getTime() + this.windowSize);
  }

  /**
   * Convert to JSON for API responses or logging
   * @returns {Object} - JSON representation
   */
  toJSON() {
    return {
      exceeded: this.exceeded,
      currentCount: this.currentCount,
      limit: this.limit,
      remaining: this.getRemainingRequests(),
      windowSizeMs: this.windowSize,
      windowSizeSeconds: this.getWindowSizeSeconds(),
      usagePercentage: this.getUsagePercentage(),
      status: this.exceeded ? 'exceeded' : 'within_limits',
      statusMessage: this.getStatusMessage(),
      checkedAt: this.checkedAt.toISOString(),
      estimatedResetAt: this.getEstimatedResetTime().toISOString(),
      userId: this.userId
    };
  }

  /**
   * Create from legacy checkRateLimits response
   * @param {Object} legacyResponse - Response from old checkRateLimits method
   * @param {string} userId - User ID
   * @param {number} windowSize - Window size in milliseconds
   * @returns {RateLimitResult} - Rate limit result
   */
  static fromLegacyResponse(legacyResponse, userId, windowSize) {
    return new RateLimitResult(
      legacyResponse.exceeded,
      legacyResponse.shortCount,
      legacyResponse.shortLimit,
      windowSize,
      userId
    );
  }

  /**
   * Merge multiple rate limit results (for multiple windows)
   * @param {Array<RateLimitResult>} results - Array of rate limit results
   * @returns {RateLimitResult} - Combined result (most restrictive)
   */
  static merge(results) {
    if (!results || results.length === 0) {
      throw new Error('Cannot merge empty rate limit results');
    }

    // Find the most restrictive result (any exceeded result takes precedence)
    const exceededResult = results.find(r => r.exceeded);
    if (exceededResult) {
      return exceededResult;
    }

    // If none exceeded, return the one with highest usage percentage
    return results.reduce((mostRestrictive, current) => {
      return current.getUsagePercentage() > mostRestrictive.getUsagePercentage() 
        ? current 
        : mostRestrictive;
    });
  }

  /**
   * Create a rate limit result for a user with no previous requests
   * @param {string} userId - User ID
   * @param {number} limit - Rate limit threshold
   * @param {number} windowSize - Window size in milliseconds
   * @returns {RateLimitResult} - Clean slate result
   */
  static cleanSlate(userId, limit, windowSize) {
    return new RateLimitResult(false, 0, limit, windowSize, userId);
  }
}

module.exports = RateLimitResult;
