/**
 * RequestLog - Domain model representing a logged HTTP request
 * Encapsulates all information about a request for logging and analysis
 */
class RequestLog {
  constructor(userId, userAgent, ipAddress, requestUrl, referrer = '', wasRedirected = false, blockReason = null) {
    this.userId = userId;
    this.userAgent = userAgent;
    this.ipAddress = ipAddress;
    this.requestUrl = requestUrl;
    this.referrer = referrer;
    this.wasRedirected = wasRedirected;
    this.blockReason = blockReason;
    this.createdAt = new Date();
  }

  /**
   * Create a RequestLog from a detection result and request data
   * @param {Object} request - Request data (userAgent, ipAddress, etc.)
   * @param {DetectionResult} detectionResult - Result of request analysis
   * @returns {RequestLog} - New request log instance
   */
  static fromDetectionResult(request, detectionResult) {
    return new RequestLog(
      detectionResult.userId,
      request.userAgent,
      request.ipAddress,
      request.path || request.url,
      request.referrer || '',
      detectionResult.shouldScramble,
      detectionResult.redirectReason
    );
  }

  /**
   * Create a RequestLog from database row
   * @param {Object} row - Database row object
   * @returns {RequestLog} - RequestLog instance
   */
  static fromDatabase(row) {
    const log = new RequestLog(
      row.user_id,
      row.user_agent,
      row.ip_address,
      row.request_url,
      row.referrer || '',
      Boolean(row.was_request_redirected),
      row.block_reason
    );
    log.createdAt = new Date(row.created_at);
    return log;
  }

  /**
   * Create an allowed request log
   * @param {string} userId - User ID
   * @param {Object} request - Request data
   * @returns {RequestLog} - Allowed request log
   */
  static allowed(userId, request) {
    return new RequestLog(
      userId,
      request.userAgent,
      request.ipAddress,
      request.path || request.url,
      request.referrer || '',
      false,
      null
    );
  }

  /**
   * Create a blocked request log
   * @param {string} userId - User ID
   * @param {Object} request - Request data
   * @param {string} reason - Block reason
   * @returns {RequestLog} - Blocked request log
   */
  static blocked(userId, request, reason) {
    return new RequestLog(
      userId,
      request.userAgent,
      request.ipAddress,
      request.path || request.url,
      request.referrer || '',
      true,
      reason
    );
  }

  /**
   * Check if this request was blocked
   * @returns {boolean} - True if request was blocked
   */
  isBlocked() {
    return this.wasRedirected;
  }

  /**
   * Check if this request was allowed
   * @returns {boolean} - True if request was allowed
   */
  isAllowed() {
    return !this.wasRedirected;
  }

  /**
   * Get the request type based on URL
   * @returns {string} - Request type (html, api, static, etc.)
   */
  getRequestType() {
    const url = this.requestUrl.toLowerCase();
    
    if (url.startsWith('/api/')) {
      return 'api';
    }
    
    if (url === '/dashboard.html' || url === '/dashboard' || url.startsWith('/dashboard/')) {
      return 'dashboard';
    }
    
    if (url === '/' || url.endsWith('.html') || url.endsWith('.htm') || url.endsWith('/') || !url.includes('.')) {
      return 'html';
    }
    
    if (url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      return 'static';
    }
    
    return 'other';
  }

  /**
   * Check if this is an HTML request
   * @returns {boolean} - True if HTML request
   */
  isHtmlRequest() {
    return this.getRequestType() === 'html';
  }

  /**
   * Check if this is an API request
   * @returns {boolean} - True if API request
   */
  isApiRequest() {
    return this.getRequestType() === 'api';
  }

  /**
   * Check if this is a dashboard request
   * @returns {boolean} - True if dashboard request
   */
  isDashboardRequest() {
    return this.getRequestType() === 'dashboard';
  }

  /**
   * Get user agent type classification
   * @returns {string} - User agent type (browser, bot, crawler, etc.)
   */
  getUserAgentType() {
    const ua = this.userAgent.toLowerCase();
    
    if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
      return 'bot';
    }
    
    if (ua.includes('chrome') || ua.includes('firefox') || ua.includes('safari') || ua.includes('edge')) {
      return 'browser';
    }
    
    if (ua.includes('curl') || ua.includes('wget') || ua.includes('http')) {
      return 'tool';
    }
    
    return 'unknown';
  }

  /**
   * Get a summary of this request for logging
   * @returns {string} - Summary string
   */
  getSummary() {
    const status = this.isBlocked() ? 'BLOCKED' : 'ALLOWED';
    const reason = this.blockReason ? ` (${this.blockReason})` : '';
    return `${status}: ${this.ipAddress} -> ${this.requestUrl}${reason}`;
  }

  /**
   * Convert to database insert parameters
   * @returns {Array} - Array of parameters for database insertion
   */
  toDatabaseParams() {
    return [
      this.userId,
      this.userAgent,
      this.ipAddress,
      this.requestUrl,
      this.referrer,
      this.wasRedirected ? 1 : 0,
      this.blockReason,
      this.createdAt.toISOString()
    ];
  }

  /**
   * Convert to JSON for API responses or logging
   * @returns {Object} - JSON representation
   */
  toJSON() {
    return {
      userId: this.userId,
      userAgent: this.userAgent,
      ipAddress: this.ipAddress,
      requestUrl: this.requestUrl,
      referrer: this.referrer,
      wasRedirected: this.wasRedirected,
      blockReason: this.blockReason,
      createdAt: this.createdAt.toISOString(),
      requestType: this.getRequestType(),
      userAgentType: this.getUserAgentType(),
      status: this.isBlocked() ? 'blocked' : 'allowed'
    };
  }

  /**
   * Validate the request log data
   * @returns {Array<string>} - Array of validation errors (empty if valid)
   */
  validate() {
    const errors = [];
    
    if (!this.userId || typeof this.userId !== 'string') {
      errors.push('User ID is required and must be a string');
    }
    
    if (!this.userAgent || typeof this.userAgent !== 'string') {
      errors.push('User agent is required and must be a string');
    }
    
    if (!this.ipAddress || typeof this.ipAddress !== 'string') {
      errors.push('IP address is required and must be a string');
    }
    
    if (!this.requestUrl || typeof this.requestUrl !== 'string') {
      errors.push('Request URL is required and must be a string');
    }
    
    if (typeof this.wasRedirected !== 'boolean') {
      errors.push('wasRedirected must be a boolean');
    }
    
    if (this.wasRedirected && !this.blockReason) {
      errors.push('Block reason is required when request is redirected');
    }
    
    return errors;
  }

  /**
   * Check if this request log is valid
   * @returns {boolean} - True if valid
   */
  isValid() {
    return this.validate().length === 0;
  }
}

module.exports = RequestLog;
