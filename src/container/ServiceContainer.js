const DatabaseAdapter = require('../../database');

// Services
const UserAgentService = require('../services/UserAgentService');
const RateLimitService = require('../services/RateLimitService');
const SettingsService = require('../services/SettingsService');
const RequestLogService = require('../services/RequestLogService');
const HoneypotService = require('../services/HoneypotService');

/**
 * ServiceContainer - Dependency injection container for the honeypot system
 * Manages service lifecycle and dependencies following Dependency Inversion Principle
 */
class ServiceContainer {
  constructor(config) {
    this.config = config;
    this.services = new Map();
    this.singletons = new Map();
    this.isInitialized = false;
    
    this.setupServices();
  }

  /**
   * Setup all service definitions and their dependencies
   */
  setupServices() {
    // Database - Singleton
    this.registerSingleton('database', () => {
      console.log('Creating DatabaseAdapter instance...');
      return new DatabaseAdapter(this.config);
    });
    
    // Core Services - Singletons
    this.registerSingleton('settingsService', () => {
      console.log('Creating SettingsService instance...');
      return new SettingsService(this.get('database'));
    });

    this.registerSingleton('userAgentService', () => {
      console.log('Creating UserAgentService instance...');
      return new UserAgentService(this.get('database'));
    });

    this.registerSingleton('rateLimitService', () => {
      console.log('Creating RateLimitService instance...');
      return new RateLimitService(
        this.get('database'), 
        this.get('settingsService'), 
        this.config
      );
    });

    this.registerSingleton('requestLogService', () => {
      console.log('Creating RequestLogService instance...');
      return new RequestLogService(this.get('database'));
    });

    // Main Honeypot Service - Singleton
    this.registerSingleton('honeypotService', () => {
      console.log('Creating HoneypotService instance...');
      return new HoneypotService(
        this.get('userAgentService'),
        this.get('rateLimitService'),
        this.get('settingsService'),
        this.get('requestLogService'),
        this.config
      );
    });
  }

  /**
   * Register a singleton service
   * @param {string} name - Service name
   * @param {Function} factory - Factory function to create the service
   */
  registerSingleton(name, factory) {
    this.services.set(name, { 
      factory, 
      isSingleton: true 
    });
  }

  /**
   * Register a transient service (new instance each time)
   * @param {string} name - Service name
   * @param {Function} factory - Factory function to create the service
   */
  registerTransient(name, factory) {
    this.services.set(name, { 
      factory, 
      isSingleton: false 
    });
  }

  /**
   * Get a service instance
   * @param {string} name - Service name
   * @returns {any} - Service instance
   */
  get(name) {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service '${name}' not found. Available services: ${Array.from(this.services.keys()).join(', ')}`);
    }
    
    if (service.isSingleton) {
      // Return cached singleton instance or create new one
      if (!this.singletons.has(name)) {
        try {
          const instance = service.factory();
          this.singletons.set(name, instance);
          console.log(`Created singleton service: ${name}`);
        } catch (error) {
          console.error(`Error creating service '${name}':`, error);
          throw new Error(`Failed to create service '${name}': ${error.message}`);
        }
      }
      return this.singletons.get(name);
    } else {
      // Create new transient instance
      try {
        return service.factory();
      } catch (error) {
        console.error(`Error creating transient service '${name}':`, error);
        throw new Error(`Failed to create transient service '${name}': ${error.message}`);
      }
    }
  }

  /**
   * Check if a service is registered
   * @param {string} name - Service name
   * @returns {boolean} - True if service is registered
   */
  has(name) {
    return this.services.has(name);
  }

  /**
   * Get all registered service names
   * @returns {Array<string>} - Array of service names
   */
  getServiceNames() {
    return Array.from(this.services.keys());
  }

  /**
   * Initialize all services that require initialization
   * This should be called after all services are registered
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('ServiceContainer already initialized');
      return;
    }

    console.log('Initializing ServiceContainer...');
    
    try {
      // Initialize core services in dependency order
      
      // 1. Database (no initialization needed)
      this.get('database');
      
      // 2. Settings Service (no initialization needed)
      this.get('settingsService');
      
      // 3. User Agent Service (needs initialization)
      const userAgentService = this.get('userAgentService');
      await userAgentService.initialize();
      
      // 4. Rate Limit Service (needs initialization)
      const rateLimitService = this.get('rateLimitService');
      await rateLimitService.initialize();
      
      // 5. Request Log Service (no initialization needed)
      this.get('requestLogService');
      
      // 6. Main Honeypot Service (needs initialization)
      const honeypotService = this.get('honeypotService');
      await honeypotService.initialize();
      
      this.isInitialized = true;
      console.log('ServiceContainer initialized successfully');
      
    } catch (error) {
      console.error('Error initializing ServiceContainer:', error);
      throw new Error(`ServiceContainer initialization failed: ${error.message}`);
    }
  }

  /**
   * Dispose of all services and cleanup resources
   */
  async dispose() {
    console.log('Disposing ServiceContainer...');
    
    // Dispose of services in reverse order
    const serviceNames = this.getServiceNames().reverse();
    
    for (const serviceName of serviceNames) {
      if (this.singletons.has(serviceName)) {
        const service = this.singletons.get(serviceName);
        
        // Call dispose method if it exists
        if (service && typeof service.dispose === 'function') {
          try {
            await service.dispose();
            console.log(`Disposed service: ${serviceName}`);
          } catch (error) {
            console.error(`Error disposing service '${serviceName}':`, error);
          }
        }
      }
    }
    
    this.singletons.clear();
    this.isInitialized = false;
    console.log('ServiceContainer disposed');
  }

  /**
   * Create a factory function for a specific service
   * Useful for middleware or route handlers
   * @param {string} serviceName - Name of the service
   * @returns {Function} - Factory function that returns the service
   */
  createServiceFactory(serviceName) {
    return () => this.get(serviceName);
  }

  /**
   * Get health status of all services
   * @returns {Promise<Object>} - Health status object
   */
  async getHealthStatus() {
    const status = {
      container: {
        initialized: this.isInitialized,
        serviceCount: this.services.size,
        singletonCount: this.singletons.size
      },
      services: {}
    };

    // Check health of each service if it has a health check method
    for (const [name, _] of this.singletons) {
      try {
        const service = this.singletons.get(name);
        if (service && typeof service.healthCheck === 'function') {
          status.services[name] = await service.healthCheck();
        } else {
          status.services[name] = { status: 'ok', message: 'Service running' };
        }
      } catch (error) {
        status.services[name] = { 
          status: 'error', 
          message: error.message 
        };
      }
    }

    return status;
  }

  /**
   * Get debugging information about the container
   * @returns {Object} - Debug information
   */
  getDebugInfo() {
    return {
      isInitialized: this.isInitialized,
      registeredServices: Array.from(this.services.keys()),
      instantiatedSingletons: Array.from(this.singletons.keys()),
      config: {
        hasConfig: !!this.config,
        configKeys: this.config ? Object.keys(this.config) : []
      }
    };
  }
}

module.exports = ServiceContainer;
