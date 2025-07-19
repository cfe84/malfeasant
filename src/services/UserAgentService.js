/**
 * UserAgentService - Handles user agent classification and management
 * Extracted from RobotDetector to follow Single Responsibility Principle
 */
class UserAgentService {
  constructor(database) {
    this.database = database;
    this.knownBadAgents = new Set();
    this.knownGoodAgents = new Set();
  }

  /**
   * Initialize the service by loading known agents from database
   */
  async initialize() {
    await this.refreshKnownAgents();
  }

  /**
   * Refresh the list of known bad and good user agents from database
   */
  async refreshKnownAgents() {
    try {
      // Load bad agents
      const badAgentsResult = await this.database.query(
        'SELECT user_agent FROM known_bad_agents WHERE is_active = ?', 
        [true]
      );
      this.knownBadAgents = new Set(
        badAgentsResult.rows.map(row => row.user_agent.toLowerCase())
      );
      
      // Load good agents
      const goodAgentsResult = await this.database.query(
        'SELECT user_agent FROM known_good_agents WHERE is_active = ?', 
        [true]
      );
      this.knownGoodAgents = new Set(
        goodAgentsResult.rows.map(row => row.user_agent.toLowerCase())
      );
      
      console.log(`Refreshed ${this.knownBadAgents.size} known bad agents and ${this.knownGoodAgents.size} known good agents`);
    } catch (error) {
      console.error('Error refreshing known agents:', error);
      throw error;
    }
  }

  /**
   * Check if user agent is in known bad agents list
   * @param {string} userAgent - The user agent string to check
   * @returns {boolean} - True if the user agent is known to be bad
   */
  isKnownBadAgent(userAgent) {
    if (!userAgent) return false;
    
    const lowercaseUserAgent = userAgent.toLowerCase();
    // Check if any of the known bad agent patterns are contained in the user agent
    for (const badAgent of this.knownBadAgents) {
      if (lowercaseUserAgent.includes(badAgent)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if user agent is in known good agents list
   * @param {string} userAgent - The user agent string to check
   * @returns {boolean} - True if the user agent is known to be good
   */
  isKnownGoodAgent(userAgent) {
    if (!userAgent) return false;
    
    const lowercaseUserAgent = userAgent.toLowerCase();
    // Check if any of the known good agent patterns are contained in the user agent
    for (const goodAgent of this.knownGoodAgents) {
      if (lowercaseUserAgent.includes(goodAgent)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Add a user agent to the bad agents list
   * @param {string} userAgent - The user agent to add
   * @returns {Promise<Object>} - Success message
   */
  async addBadAgent(userAgent) {
    try {
      if (!userAgent) {
        throw new Error('User agent is required');
      }

      if (this.database.dbType === 'sqlite') {
        await this.database.query(
          'INSERT OR REPLACE INTO known_bad_agents (user_agent, is_active) VALUES (?, ?)',
          [userAgent, 1]
        );
      } else {
        await this.database.query(
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

  /**
   * Get all bad agents from the database
   * @returns {Promise<Object>} - List of bad agents
   */
  async getBadAgents() {
    try {
      const result = await this.database.query(
        'SELECT id, user_agent, is_active, created_at FROM known_bad_agents ORDER BY created_at DESC'
      );
      return { badAgents: result.rows };
    } catch (error) {
      console.error('Error getting bad agents:', error);
      throw error;
    }
  }

  /**
   * Delete a bad agent from the database
   * @param {number} id - The ID of the agent to delete
   * @returns {Promise<Object>} - Success message
   */
  async deleteBadAgent(id) {
    try {
      if (!id) {
        throw new Error('Agent ID is required');
      }

      await this.database.query('DELETE FROM known_bad_agents WHERE id = ?', [id]);
      
      // Refresh the known agents cache
      await this.refreshKnownAgents();
      
      return { message: 'Bad user agent deleted successfully' };
    } catch (error) {
      console.error('Error deleting bad user agent:', error);
      throw error;
    }
  }

  /**
   * Update a bad agent's active status
   * @param {number} id - The ID of the agent to update
   * @param {boolean} isActive - Whether the agent should be active
   * @returns {Promise<Object>} - Success message
   */
  async updateBadAgent(id, isActive) {
    try {
      if (!id) {
        throw new Error('Agent ID is required');
      }

      const activeValue = this.database.dbType === 'sqlite' ? (isActive ? 1 : 0) : isActive;
      await this.database.query(
        'UPDATE known_bad_agents SET is_active = ? WHERE id = ?', 
        [activeValue, id]
      );
      
      // Refresh the known agents cache
      await this.refreshKnownAgents();
      
      return { message: 'Bad user agent updated successfully' };
    } catch (error) {
      console.error('Error updating bad user agent:', error);
      throw error;
    }
  }

  /**
   * Add a user agent to the good agents list
   * @param {string} userAgent - The user agent to add
   * @returns {Promise<Object>} - Success message
   */
  async addGoodAgent(userAgent) {
    try {
      if (!userAgent) {
        throw new Error('User agent is required');
      }

      if (this.database.dbType === 'sqlite') {
        await this.database.query(
          'INSERT OR REPLACE INTO known_good_agents (user_agent, is_active) VALUES (?, ?)',
          [userAgent, 1]
        );
      } else {
        await this.database.query(
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

  /**
   * Get all good agents from the database
   * @returns {Promise<Object>} - List of good agents
   */
  async getGoodAgents() {
    try {
      const result = await this.database.query(
        'SELECT id, user_agent, is_active, created_at FROM known_good_agents ORDER BY created_at DESC'
      );
      return { goodAgents: result.rows };
    } catch (error) {
      console.error('Error getting good agents:', error);
      throw error;
    }
  }

  /**
   * Delete a good agent from the database
   * @param {number} id - The ID of the agent to delete
   * @returns {Promise<Object>} - Success message
   */
  async deleteGoodAgent(id) {
    try {
      if (!id) {
        throw new Error('Agent ID is required');
      }

      await this.database.query('DELETE FROM known_good_agents WHERE id = ?', [id]);
      
      // Refresh the known agents cache
      await this.refreshKnownAgents();
      
      return { message: 'Good user agent deleted successfully' };
    } catch (error) {
      console.error('Error deleting good user agent:', error);
      throw error;
    }
  }

  /**
   * Update a good agent's active status
   * @param {number} id - The ID of the agent to update
   * @param {boolean} isActive - Whether the agent should be active
   * @returns {Promise<Object>} - Success message
   */
  async updateGoodAgent(id, isActive) {
    try {
      if (!id) {
        throw new Error('Agent ID is required');
      }

      const activeValue = this.database.dbType === 'sqlite' ? (isActive ? 1 : 0) : isActive;
      await this.database.query(
        'UPDATE known_good_agents SET is_active = ? WHERE id = ?', 
        [activeValue, id]
      );
      
      // Refresh the known agents cache
      await this.refreshKnownAgents();
      
      return { message: 'Good user agent updated successfully' };
    } catch (error) {
      console.error('Error updating good user agent:', error);
      throw error;
    }
  }
}

module.exports = UserAgentService;
