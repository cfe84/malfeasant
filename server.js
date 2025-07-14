const express = require('express');
const path = require('path');
const cors = require('cors');
const config = require('./config');
const RobotDetector = require('./robot');
const ContentScrambler = require('./scramble');

const app = express();

// Validate configuration
const validation = config.validate();
if (!validation.isValid) {
  console.error('Configuration validation failed:');
  validation.errors.forEach(error => console.error('  ERROR:', error));
  process.exit(1);
}

if (validation.warnings.length > 0) {
  console.warn('Configuration warnings:');
  validation.warnings.forEach(warning => console.warn('  WARNING:', warning));
}

// Initialize instances with configuration
const robotDetector = new RobotDetector(config);
const contentScrambler = new ContentScrambler(config);

// Utility function to format error responses
function formatErrorResponse(error, isDev = false) {
  if (isDev) {
    return {
      error: 'Internal server error',
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
  } else {
    return {
      error: 'Internal server error'
    };
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Override server header with fake server information
app.use(async (req, res, next) => {
  const fakeServer = await robotDetector.getFakeServerHeader();
  res.set('Server', fakeServer);
  next();
});

// Trust proxy for correct IP addresses
app.set('trust proxy', true);

// Static files for HP management.
const publicDir = config.paths.publicDir;

// API Authentication middleware
const authenticateAPI = (req, res, next) => {
  const apiSecret = req.get('X-API-Secret');
  const expectedSecret = config.server.apiSecret;
  
  if (!apiSecret || apiSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized - Invalid API secret' });
  }
  
  next();
};

// Middleware to handle robot detection for HTML content (for honeypot static content only)
app.use(async (req, res, next) => {
  const userAgent = req.get('User-Agent') || '';
  const ipAddress = req.ip || req.connection.remoteAddress;
  const referrer = req.get('Referer') || '';
  const requestPath = req.path;
  const queryParams = req.query;

  console.log(`Request: ${req.method} ${requestPath} from ${ipAddress} (${userAgent})`);

  try {
    // Check if honeypot is enabled
    const honeypotEnabled = await robotDetector.getHoneypotStatus();
    
    if (honeypotEnabled) {
      // Only apply robot detection to HTML requests for API and dashboard content
      // Blog content is handled by its own middleware above  
      if (robotDetector.isHtmlRequest(requestPath) && (requestPath.startsWith('/api/') || requestPath === '/dashboard.html' || requestPath === '/dashboard')) {
        const result = await robotDetector.getContent(requestPath, userAgent, ipAddress, referrer, queryParams);
        
        // Don't scramble the dashboard even if scramble parameter is present
        const isDashboard = requestPath === '/dashboard.html' || requestPath === '/dashboard';
        
        if (result.shouldScramble && !isDashboard) {
          console.log(`Serving scrambled content: ${result.redirectReason}`);
          const scrambledResponse = await contentScrambler.getScrambledResponse(requestPath, queryParams);
          return res.type(scrambledResponse.contentType).send(scrambledResponse.content);
        } else if (result.shouldRedirect) {
          console.log(`Redirecting request: ${result.redirectReason}`);
          return res.redirect(302, result.redirectUrl);
        }
      } else {
        // For non-HTML requests, still log them but don't apply restrictions
        const userId = robotDetector.generateUserId(userAgent, ipAddress);
        await robotDetector.logRequest(userId, userAgent, ipAddress, requestPath, referrer, false, null);
      }
    } else {
      // Honeypot disabled - just log the request without any restrictions
      const userId = robotDetector.generateUserId(userAgent, ipAddress);
      await robotDetector.logRequest(userId, userAgent, ipAddress, requestPath, referrer, false, 'Honeypot disabled');
    }
  } catch (error) {
    console.error('Error in robot detection middleware:', error);
    // Continue serving the request even if robot detection fails
  }

  next();
});

// Set up static content directories
const honeypotStaticDir = config.paths.honeypotStaticDir;
const blogStaticDir = config.paths.blogStaticDir;
const blogRoutePrefix = config.routes.blogRoutePrefix;

// Custom static file handler that respects robot detection
app.use(blogRoutePrefix, async (req, res, next) => {
  const userAgent = req.get('User-Agent') || '';
  const ipAddress = req.ip || req.connection.remoteAddress;
  const referrer = req.get('Referer') || '';
  const requestPath = req.path;
  const queryParams = req.query;

  try {
    // Check if honeypot is enabled
    const honeypotEnabled = await robotDetector.getHoneypotStatus();
    
    if (honeypotEnabled) {
      // Only apply robot detection to HTML requests
      if (robotDetector.isHtmlRequest(requestPath)) {
        const result = await robotDetector.getContent(requestPath, userAgent, ipAddress, referrer, queryParams);
        
        // Don't scramble the dashboard even if scramble parameter is present
        const isDashboard = requestPath === '/dashboard.html' || requestPath === '/dashboard';
        
        if (result.shouldScramble && !isDashboard) {
          console.log(`Serving scrambled content: ${result.redirectReason}`);
          const scrambledResponse = await contentScrambler.getScrambledResponse(requestPath, queryParams);
          return res.type(scrambledResponse.contentType).send(scrambledResponse.content);
        }
      } else {
        // For non-HTML requests, still log them but don't apply restrictions
        const userId = robotDetector.generateUserId(userAgent, ipAddress);
        await robotDetector.logRequest(userId, userAgent, ipAddress, requestPath, referrer, false, null);
      }
    } else {
      // Honeypot disabled - just log the request without any restrictions
      const userId = robotDetector.generateUserId(userAgent, ipAddress);
      await robotDetector.logRequest(userId, userAgent, ipAddress, requestPath, referrer, false, 'Honeypot disabled');
    }
  } catch (error) {
    console.error('Error in robot detection middleware:', error);
    // Continue serving the request even if robot detection fails
  }

  // If no scrambling/redirect needed, serve static files normally
  express.static(blogStaticDir)(req, res, next);
});

// Serve honeypot static files from root
app.use(express.static(honeypotStaticDir));

// API endpoint to get request statistics
app.get('/api/stats', authenticateAPI, async (req, res) => {
  try {
    const stats = await robotDetector.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json(formatErrorResponse(error, config.server.isDevelopment));
  }
});

// API endpoint to add a known bad user agent
app.post('/api/bad-agent', authenticateAPI, async (req, res) => {
  try {
    const { userAgent } = req.body;
    const result = await robotDetector.addBadAgent(userAgent);
    res.json(result);
  } catch (error) {
    if (error.message === 'User agent is required') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error adding bad user agent:', error);
    res.status(500).json(formatErrorResponse(error, config.server.isDevelopment));
  }
});

// API endpoint to get known bad agents
app.get('/api/bad-agents', authenticateAPI, async (req, res) => {
  try {
    const result = await robotDetector.getBadAgents();
    res.json(result);
  } catch (error) {
    console.error('Error getting bad agents:', error);
    res.status(500).json(formatErrorResponse(error, config.server.isDevelopment));
  }
});

// API endpoint to delete a known bad user agent
app.delete('/api/bad-agent/:id', authenticateAPI, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await robotDetector.deleteBadAgent(id);
    res.json(result);
  } catch (error) {
    if (error.message === 'Agent ID is required') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error deleting bad user agent:', error);
    res.status(500).json(formatErrorResponse(error, config.server.isDevelopment));
  }
});

// API endpoint to toggle a known bad user agent's active status
app.patch('/api/bad-agent/:id', authenticateAPI, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    const result = await robotDetector.updateBadAgent(id, isActive);
    res.json(result);
  } catch (error) {
    if (error.message === 'Agent ID is required') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating bad user agent:', error);
    res.status(500).json(formatErrorResponse(error, config.server.isDevelopment));
  }
});

// Good Agents API endpoints

// API endpoint to add a known good user agent
app.post('/api/good-agent', authenticateAPI, async (req, res) => {
  try {
    const { userAgent } = req.body;
    const result = await robotDetector.addGoodAgent(userAgent);
    res.json(result);
  } catch (error) {
    if (error.message === 'User agent is required') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error adding good user agent:', error);
    res.status(500).json(formatErrorResponse(error, config.server.isDevelopment));
  }
});

// API endpoint to get known good agents
app.get('/api/good-agents', authenticateAPI, async (req, res) => {
  try {
    const result = await robotDetector.getGoodAgents();
    res.json(result);
  } catch (error) {
    console.error('Error getting good agents:', error);
    res.status(500).json(formatErrorResponse(error, config.server.isDevelopment));
  }
});

// API endpoint to delete a known good user agent
app.delete('/api/good-agent/:id', authenticateAPI, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await robotDetector.deleteGoodAgent(id);
    res.json(result);
  } catch (error) {
    if (error.message === 'Agent ID is required') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error deleting good user agent:', error);
    res.status(500).json(formatErrorResponse(error, config.server.isDevelopment));
  }
});

// API endpoint to toggle a known good user agent's active status
app.patch('/api/good-agent/:id', authenticateAPI, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    const result = await robotDetector.updateGoodAgent(id, isActive);
    res.json(result);
  } catch (error) {
    if (error.message === 'Agent ID is required') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating good user agent:', error);
    res.status(500).json(formatErrorResponse(error, config.server.isDevelopment));
  }
});

// API endpoint to get honeypot status
app.get('/api/honeypot/status', authenticateAPI, async (req, res) => {
  try {
    const isEnabled = await robotDetector.getHoneypotStatus();
    res.json({ enabled: isEnabled });
  } catch (error) {
    console.error('Error getting honeypot status:', error);
    res.status(500).json(formatErrorResponse(error, config.server.isDevelopment));
  }
});

// API endpoint to toggle honeypot status
app.post('/api/honeypot/toggle', authenticateAPI, async (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled field must be a boolean' });
    }
    
    const success = await robotDetector.setHoneypotStatus(enabled);
    if (success) {
      res.json({ 
        success: true, 
        enabled: enabled, 
        message: `Honeypot ${enabled ? 'enabled' : 'disabled'} successfully` 
      });
    } else {
      res.status(500).json({ error: 'Failed to update honeypot status' });
    }
  } catch (error) {
    console.error('Error toggling honeypot status:', error);
    res.status(500).json(formatErrorResponse(error, config.server.isDevelopment));
  }
});

// API endpoint to get all settings
app.get('/api/settings', authenticateAPI, async (req, res) => {
  try {
    const settings = await robotDetector.getAllSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json(formatErrorResponse(error, config.server.isDevelopment));
  }
});

// API endpoint to update settings
app.post('/api/settings', authenticateAPI, async (req, res) => {
  try {
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'settings field must be an object' });
    }
    
    // Validate and update each setting
    const results = {};
    const validSettings = [
      'rate_limit_short_window',
      'rate_limit_short_max', 
      'fake_server_header',
      'known_agents_refresh_interval',
      'rate_counter_cleanup_interval'
    ];
    
    for (const [key, value] of Object.entries(settings)) {
      if (!validSettings.includes(key)) {
        results[key] = { success: false, error: 'Invalid setting key' };
        continue;
      }
      
      // Basic validation
      if (key.includes('interval') || key.includes('window') || key.includes('max')) {
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 1) {
          results[key] = { success: false, error: 'Must be a positive integer' };
          continue;
        }
      }
      
      const success = await robotDetector.setSetting(key, value.toString());
      results[key] = { success };
    }
    
    res.json({ 
      success: true, 
      results,
      message: 'Settings updated successfully. Server restart recommended for some changes to take effect.'
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json(formatErrorResponse(error, config.server.isDevelopment));
  }
});

// Handle 404 for missing static files
app.use((req, res) => {
  const custom404Page = config.paths.custom404Page;
  
  if (custom404Page) {
    // Check if custom 404 file exists and serve it
    const fs = require('fs');
    if (fs.existsSync(custom404Page)) {
      return res.status(404).sendFile(custom404Page);
    }
  }
  
  // Fallback to default 404 message
  res.status(404).send('Not Found');
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  // Send detailed error information in development
  const errorResponse = formatErrorResponse(error, config.server.isDevelopment);
  
  if (req.accepts('json')) {
    res.status(500).json(errorResponse);
  } else {
    res.status(500).send(config.server.isDevelopment ? 
      `Internal Server Error\n\nError: ${error.message}\n\nStack:\n${error.stack}` : 
      'Internal Server Error'
    );
  }
});

app.listen(config.server.port, () => {
  console.log(`Crawler honeypot server running at http://localhost:${config.server.port}`);
  console.log(`Environment: ${config.server.nodeEnv}`);
});
