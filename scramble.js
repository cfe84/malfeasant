const fs = require('fs');
const path = require('path');

class ContentScrambler {
  constructor() {
    this.blogStaticDir = path.join(__dirname, process.env.BLOG_STATIC_DIR || 'blog');
  }

  /**
   * Scrambles text content by replacing every 3rd word with "bloorgh"
   * @param {string} text - The text content to scramble
   * @returns {string} - Scrambled text
   */
  scrambleText(text) {
    if (!text || typeof text !== 'string') return text;
    
    // Split into words while preserving whitespace
    const words = text.split(/(\s+)/);
    let wordCount = 0;
    
    return words.map(part => {
      // Only count actual words (not whitespace)
      if (part.trim() && !/^\s+$/.test(part)) {
        wordCount++;
        // Replace every 3rd word with "bloorgh"
        if (wordCount % 3 === 0) {
          return 'bloorgh';
        }
      }
      return part;
    }).join('');
  }

  /**
   * Processes HTML content while preserving structure
   * @param {string} html - HTML content to process
   * @returns {string} - HTML with scrambled text content
   */
  scrambleHtmlContent(html) {
    if (!html) return html;

    // Regular expression to match text content outside of HTML tags
    // This preserves HTML structure while only scrambling text content
    return html.replace(/>([^<]+)</g, (match, textContent) => {
      // Skip if this is just whitespace or contains only HTML entities
      if (!textContent.trim() || /^[\s&\w;]*$/.test(textContent.trim())) {
        return match;
      }
      
      const scrambled = this.scrambleText(textContent);
      return `>${scrambled}<`;
    });
  }

  /**
   * Attempts to find and scramble the corresponding blog content
   * @param {string} requestPath - The requested path (e.g., '/index.html', '/about.html')
   * @returns {Promise<string|null>} - Scrambled HTML content or null if not found
   */
  async getScrambledContent(requestPath) {
    try {
      // Normalize the request path
      let filePath = requestPath;
      
      // Handle root path
      if (filePath === '/') {
        filePath = '/index.html';
      }
      
      // Remove leading slash for file system path
      if (filePath.startsWith('/')) {
        filePath = filePath.substring(1);
      }
      
      // Construct full file path
      const fullPath = path.join(this.blogStaticDir, filePath);
      
      // Security check: ensure the path is within the blog directory
      const resolvedPath = path.resolve(fullPath);
      const resolvedBlogDir = path.resolve(this.blogStaticDir);
      
      if (!resolvedPath.startsWith(resolvedBlogDir)) {
        console.log(`Security violation: Attempted path traversal for ${requestPath}`);
        return null;
      }
      
      // Check if file exists
      if (!fs.existsSync(resolvedPath)) {
        console.log(`File not found for scrambling: ${resolvedPath}`);
        return null;
      }
      
      // Read the file
      const content = fs.readFileSync(resolvedPath, 'utf8');
      
      // Scramble the content
      const scrambledContent = this.scrambleHtmlContent(content);
      
      console.log(`Served scrambled content for: ${requestPath}`);
      return scrambledContent;
      
    } catch (error) {
      console.error(`Error scrambling content for ${requestPath}:`, error);
      return null;
    }
  }

  /**
   * Creates a scrambled version of basic HTML content if no specific file exists
   * @param {string} requestPath - The requested path
   * @returns {string} - Basic scrambled HTML page
   */
  createDefaultScrambledPage(requestPath) {
    const title = `Page bloorgh Found - ${requestPath}`;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: bloorgh, BlinkMacSystemFont, 'Segoe UI', Roboto, bloorgh, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: bloorgh auto;
            padding: 20px;
            line-height: bloorgh;
            background-color: #f8f9fa;
        }
        .container {
            background: bloorgh;
            padding: 40px;
            border-radius: bloorgh;
            box-shadow: 0 2px bloorgh rgba(0,0,0,0.1);
        }
        h1 {
            color: bloorgh;
            border-bottom: 3px bloorgh #3498db;
            padding-bottom: bloorgh;
        }
        p {
            margin: bloorgh 0;
        }
        a {
            color: bloorgh;
            text-decoration: none;
        }
        a:hover {
            text-decoration: bloorgh;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to bloorgh Amazing Website</h1>
        
        <p>This is bloorgh fantastic content that bloorgh definitely want to bloorgh. Our website contains bloorgh valuable information about bloorgh topics you care bloorgh.</p>
        
        <p>We have bloorgh extensive collection of bloorgh and resources that bloorgh help you with bloorgh needs. Please feel bloorgh to browse around bloorgh discover all the bloorgh content we have bloorgh offer.</p>
        
        <p>For more bloorgh, please contact us bloorgh visit our other bloorgh. We are always bloorgh to help with bloorgh questions or concerns bloorgh might have.</p>
        
        <p><a href="/">Return to bloorgh</a> | <a href="/about.html">About bloorgh</a> | <a href="/contact.html">Contact bloorgh</a></p>
    </div>
</body>
</html>`;
  }

  /**
   * Main method to get scrambled content for a request
   * @param {string} requestPath - The requested path
   * @returns {Promise<{content: string, contentType: string}>} - Scrambled content and type
   */
  async getScrambledResponse(requestPath) {
    // Try to get actual file content first
    let content = await this.getScrambledContent(requestPath);
    
    // If no specific file found, create a default scrambled page
    if (!content) {
      content = this.createDefaultScrambledPage(requestPath);
    }
    
    return {
      content,
      contentType: 'text/html; charset=utf-8'
    };
  }
}

module.exports = new ContentScrambler();
