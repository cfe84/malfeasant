/**
 * RequestLogService - Handles request logging and statistics
 * Extracted from RobotDetector to follow Single Responsibility Principle
 */
class RequestLogService {
  constructor(database) {
    this.database = database;
  }

  /**
   * Log a request to the database
   * @param {string} userId - The user ID
   * @param {string} userAgent - The user agent string
   * @param {string} ipAddress - The IP address
   * @param {string} requestUrl - The requested URL
   * @param {string} referrer - The referrer header
   * @param {boolean} wasRedirected - Whether the request was redirected/blocked
   * @param {string|null} blockReason - The reason for blocking (if any)
   * @returns {Promise<void>}
   */
  async logRequest(userId, userAgent, ipAddress, requestUrl, referrer, wasRedirected, blockReason = null) {
    try {
      const now = new Date();

      await this.database.query(
        `INSERT INTO request_logs 
         (user_id, user_agent, ip_address, request_url, referrer, was_request_redirected, block_reason, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, userAgent, ipAddress, requestUrl, referrer, wasRedirected ? 1 : 0, blockReason, now.toISOString()]
      );
    } catch (error) {
      console.error('Error logging request:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive statistics about requests
   * @returns {Promise<Object>} - Statistics object
   */
  async getStats() {
    try {
      // Get total requests
      const totalRequests = await this.database.query(
        'SELECT COUNT(*) as count FROM request_logs'
      );
      
      // Get blocked requests
      const blockedRequests = await this.database.query(
        'SELECT COUNT(*) as count FROM request_logs WHERE was_request_redirected = ?', 
        [1]
      );
      
      // Get block reasons breakdown
      const blockReasons = await this.database.query(`
        SELECT block_reason, COUNT(*) as count 
        FROM request_logs 
        WHERE was_request_redirected = 1 AND block_reason IS NOT NULL
        GROUP BY block_reason 
        ORDER BY count DESC
      `);
      
      // Get top user agents
      const topUserAgents = await this.database.query(`
        SELECT user_agent, COUNT(*) as count 
        FROM request_logs 
        GROUP BY user_agent 
        ORDER BY count DESC 
        LIMIT 10
      `);
      
      // Get recent requests with block reasons
      const recentRequests = await this.database.query(`
        SELECT ip_address, user_agent, request_url, was_request_redirected, block_reason, created_at 
        FROM request_logs 
        WHERE request_url NOT LIKE '/api/%' and request_url != '/dashboard.html'
        ORDER BY created_at DESC 
        LIMIT 50
      `);

      // Get top blocked user agents
      const topBlockedUserAgents = await this.database.query(`
        SELECT user_agent, COUNT(*) as count 
        FROM request_logs 
        WHERE was_request_redirected = 1 AND user_agent IS NOT NULL
        GROUP BY user_agent 
        ORDER BY count DESC 
        LIMIT 10
      `);

      // Get top blocked IPs
      const topBlockedIPs = await this.database.query(`
        SELECT ip_address, COUNT(*) as count 
        FROM request_logs 
        WHERE was_request_redirected = 1 AND ip_address IS NOT NULL
        GROUP BY ip_address 
        ORDER BY count DESC 
        LIMIT 10
      `);

      return {
        totalRequests: parseInt(totalRequests.rows[0].count),
        blockedRequests: parseInt(blockedRequests.rows[0].count),
        blockReasons: blockReasons.rows,
        topUserAgents: topUserAgents.rows,
        topBlockedUserAgents: topBlockedUserAgents.rows,
        topBlockedIPs: topBlockedIPs.rows,
        recentRequests: recentRequests.rows
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  }

  /**
   * Get requests by date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} - Array of request logs
   */
  async getRequestsByDateRange(startDate, endDate) {
    try {
      const result = await this.database.query(`
        SELECT user_id, user_agent, ip_address, request_url, referrer, 
               was_request_redirected, block_reason, created_at
        FROM request_logs 
        WHERE created_at BETWEEN ? AND ?
        ORDER BY created_at DESC
      `, [startDate.toISOString(), endDate.toISOString()]);

      return result.rows;
    } catch (error) {
      console.error('Error getting requests by date range:', error);
      throw error;
    }
  }

  /**
   * Get requests by user ID
   * @param {string} userId - The user ID to search for
   * @param {number} limit - Maximum number of results
   * @returns {Promise<Array>} - Array of request logs
   */
  async getRequestsByUserId(userId, limit = 100) {
    try {
      const result = await this.database.query(`
        SELECT user_id, user_agent, ip_address, request_url, referrer, 
               was_request_redirected, block_reason, created_at
        FROM request_logs 
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `, [userId, limit]);

      return result.rows;
    } catch (error) {
      console.error('Error getting requests by user ID:', error);
      throw error;
    }
  }

  /**
   * Get blocked requests statistics
   * @param {number} hours - Number of hours to look back (default 24)
   * @returns {Promise<Object>} - Blocked requests statistics
   */
  async getBlockedRequestsStats(hours = 24) {
    try {
      const sinceDate = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      const result = await this.database.query(`
        SELECT 
          COUNT(*) as total_blocked,
          COUNT(DISTINCT user_id) as unique_users_blocked,
          COUNT(DISTINCT ip_address) as unique_ips_blocked
        FROM request_logs 
        WHERE was_request_redirected = 1 
        AND created_at > ?
      `, [sinceDate.toISOString()]);

      const blockReasonStats = await this.database.query(`
        SELECT block_reason, COUNT(*) as count
        FROM request_logs 
        WHERE was_request_redirected = 1 
        AND created_at > ?
        AND block_reason IS NOT NULL
        GROUP BY block_reason
        ORDER BY count DESC
      `, [sinceDate.toISOString()]);

      return {
        period: `${hours} hours`,
        totalBlocked: parseInt(result.rows[0].total_blocked),
        uniqueUsersBlocked: parseInt(result.rows[0].unique_users_blocked),
        uniqueIpsBlocked: parseInt(result.rows[0].unique_ips_blocked),
        blockReasons: blockReasonStats.rows
      };
    } catch (error) {
      console.error('Error getting blocked requests stats:', error);
      throw error;
    }
  }

  /**
   * Get top attacking user agents
   * @param {number} limit - Maximum number of results
   * @param {number} hours - Number of hours to look back (default 24)
   * @returns {Promise<Array>} - Array of user agents with attack counts
   */
  async getTopAttackingUserAgents(limit = 10, hours = 24) {
    try {
      const sinceDate = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      const result = await this.database.query(`
        SELECT 
          user_agent,
          COUNT(*) as attack_count,
          COUNT(DISTINCT ip_address) as unique_ips,
          MAX(created_at) as last_seen
        FROM request_logs 
        WHERE was_request_redirected = 1 
        AND created_at > ?
        GROUP BY user_agent
        ORDER BY attack_count DESC
        LIMIT ?
      `, [sinceDate.toISOString(), limit]);

      return result.rows;
    } catch (error) {
      console.error('Error getting top attacking user agents:', error);
      throw error;
    }
  }

  /**
   * Get request volume over time
   * @param {number} hours - Number of hours to look back
   * @param {number} bucketSizeMinutes - Size of time buckets in minutes
   * @returns {Promise<Array>} - Array of time buckets with request counts
   */
  async getRequestVolumeOverTime(hours = 24, bucketSizeMinutes = 60) {
    try {
      const sinceDate = new Date(Date.now() - hours * 60 * 60 * 1000);
      const bucketSizeMs = bucketSizeMinutes * 60 * 1000;
      
      // This is a simplified version - in production you'd use database-specific time bucketing
      const result = await this.database.query(`
        SELECT 
          created_at,
          was_request_redirected
        FROM request_logs 
        WHERE created_at > ?
        ORDER BY created_at
      `, [sinceDate.toISOString()]);

      // Group into time buckets
      const buckets = new Map();
      const startTime = Math.floor(sinceDate.getTime() / bucketSizeMs) * bucketSizeMs;
      const endTime = Date.now();

      // Initialize buckets
      for (let time = startTime; time <= endTime; time += bucketSizeMs) {
        buckets.set(time, { total: 0, blocked: 0, allowed: 0 });
      }

      // Fill buckets with data
      for (const row of result.rows) {
        const timestamp = new Date(row.created_at).getTime();
        const bucketTime = Math.floor(timestamp / bucketSizeMs) * bucketSizeMs;
        
        if (buckets.has(bucketTime)) {
          const bucket = buckets.get(bucketTime);
          bucket.total++;
          if (row.was_request_redirected) {
            bucket.blocked++;
          } else {
            bucket.allowed++;
          }
        }
      }

      return Array.from(buckets.entries()).map(([time, counts]) => ({
        timestamp: new Date(time).toISOString(),
        ...counts
      }));
    } catch (error) {
      console.error('Error getting request volume over time:', error);
      throw error;
    }
  }

  /**
   * Clean up old request logs
   * @param {number} daysToKeep - Number of days of logs to keep
   * @returns {Promise<number>} - Number of deleted records
   */
  async cleanupOldLogs(daysToKeep = 30) {
    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
      
      const result = await this.database.query(
        'DELETE FROM request_logs WHERE created_at < ?',
        [cutoffDate.toISOString()]
      );

      const deletedCount = result.affectedRows || result.changes || 0;
      console.log(`Cleaned up ${deletedCount} old request logs older than ${daysToKeep} days`);
      
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old logs:', error);
      throw error;
    }
  }
}

module.exports = RequestLogService;
