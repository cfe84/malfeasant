/**
 * DetectionResult - Value object representing the result of request analysis
 * Encapsulates whether a request should be scrambled and why
 */
class DetectionResult {
  constructor(shouldScramble, redirectReason, userId) {
    this.shouldScramble = shouldScramble;
    this.redirectReason = redirectReason;
    this.userId = userId;
    this.timestamp = new Date();
  }

  /**
   * Create a result indicating the request is allowed
   * @param {string} userId - The user ID
   * @returns {DetectionResult} - Allowed detection result
   */
  static allowed(userId) {
    return new DetectionResult(false, null, userId);
  }

  /**
   * Create a result indicating the request should be blocked
   * @param {string} userId - The user ID
   * @param {string} reason - The reason for blocking
   * @returns {DetectionResult} - Blocked detection result
   */
  static blocked(userId, reason) {
    return new DetectionResult(true, reason, userId);
  }

  /**
   * Create a result for scramble parameter detection
   * @param {string} userId - The user ID
   * @returns {DetectionResult} - Scramble parameter detection result
   */
  static scrambleParameter(userId) {
    return DetectionResult.blocked(userId, 'Scramble parameter detected');
  }

  /**
   * Create a result for known bad user agent
   * @param {string} userId - The user ID
   * @returns {DetectionResult} - Bad user agent detection result
   */
  static knownBadAgent(userId) {
    return DetectionResult.blocked(userId, 'Known bad user agent');
  }

  /**
   * Create a result for rate limit exceeded
   * @param {string} userId - The user ID
   * @param {number} requestCount - Current request count
   * @param {number} limit - The rate limit
   * @returns {DetectionResult} - Rate limit exceeded result
   */
  static rateLimitExceeded(userId, requestCount, limit) {
    return DetectionResult.blocked(
      userId, 
      `Rate limit exceeded: ${requestCount}/${limit} (1min)`
    );
  }

  /**
   * Check if this result indicates the request should be blocked
   * @returns {boolean} - True if request should be blocked
   */
  isBlocked() {
    return this.shouldScramble;
  }

  /**
   * Check if this result indicates the request is allowed
   * @returns {boolean} - True if request is allowed
   */
  isAllowed() {
    return !this.shouldScramble;
  }

  /**
   * Get a human-readable description of the result
   * @returns {string} - Description of the detection result
   */
  getDescription() {
    if (this.isAllowed()) {
      return 'Request allowed';
    }
    return `Request blocked: ${this.redirectReason}`;
  }

  /**
   * Convert to JSON for logging or API responses
   * @returns {Object} - JSON representation
   */
  toJSON() {
    return {
      shouldScramble: this.shouldScramble,
      redirectReason: this.redirectReason,
      userId: this.userId,
      timestamp: this.timestamp.toISOString(),
      status: this.isBlocked() ? 'blocked' : 'allowed'
    };
  }

  /**
   * Create from legacy robot detector response
   * @param {Object} legacyResponse - Response from old getContent method
   * @returns {DetectionResult} - Detection result
   */
  static fromLegacyResponse(legacyResponse) {
    return new DetectionResult(
      legacyResponse.shouldScramble,
      legacyResponse.redirectReason,
      legacyResponse.userId
    );
  }
}

module.exports = DetectionResult;
