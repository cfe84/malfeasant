const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const markovChain = require('./markov');
const SeededRandom = require('./seeded-random');

class ContentScrambler {
  constructor() {
    this.blogStaticDir = path.join(__dirname, process.env.BLOG_STATIC_DIR || 'blog');
    this.initializeMarkovIndex();
  }

  /**
   * Initialize the Markov chain index
   */
  async initializeMarkovIndex() {
    try {
      await markovChain.buildIndex();
      const stats = markovChain.getStats();
      console.log(`Markov scrambler ready: ${stats.totalWords} words, ${stats.totalTransitions} transitions`);
    } catch (error) {
      console.error('Error initializing Markov index:', error);
    }
  }

  /**
   * Generate a deterministic seed from URL path
   * @param {string} requestPath - The URL path
   * @returns {string} - Deterministic seed
   */
  generateSeedFromPath(requestPath) {
    return crypto.createHash('md5').update(requestPath || '/').digest('hex');
  }

  /**
   * Scrambles text content using Markov chain-based word replacement
   * @param {string} text - The text content to scramble
   * @param {string} seed - Seed for deterministic randomization
   * @returns {string} - Scrambled text
   */
  scrambleText(text, seed) {
    if (!text || typeof text !== 'string') return text;
    
    // Split into words while preserving whitespace and punctuation
    const parts = text.split(/(\s+|[.,!?;:"'()[\]{}\-—–])/);
    const words = [];
    const nonWordParts = [];
    
    // Separate words from punctuation/whitespace
    parts.forEach((part, index) => {
      if (part.match(/^[a-zA-Z0-9']+$/)) {
        words.push({ text: part, index });
      } else {
        nonWordParts.push({ text: part, index });
      }
    });
    
    if (words.length === 0) return text;
    
    // Create result by replacing words while preserving structure
    const result = [...parts];
    
    // Generate words one by one with varied seeds to avoid repetition
    words.forEach((wordInfo, wordIndex) => {
      // Create a unique seed for each word position by combining original seed with word index and text position
      const wordSeed = seed + wordIndex.toString() + wordInfo.index.toString() + text.length.toString();
      const replacementWords = markovChain.generateWords(1, wordSeed);
      
      if (replacementWords.length > 0 && replacementWords[0] && typeof replacementWords[0] === 'string') {
        // Preserve original capitalization pattern
        const originalWord = wordInfo.text;
        const replacementWord = replacementWords[0];
        
        let finalWord = replacementWord;
        
        // Apply capitalization pattern from original word
        if (originalWord[0] === originalWord[0].toUpperCase()) {
          // First letter was capitalized
          finalWord = replacementWord.charAt(0).toUpperCase() + replacementWord.slice(1);
        }
        
        if (originalWord === originalWord.toUpperCase() && originalWord.length > 1) {
          // Entire word was uppercase
          finalWord = replacementWord.toUpperCase();
        }
        
        result[wordInfo.index] = finalWord;
      } else {
        // Fallback: keep original word if replacement generation failed
        console.log(`Warning: Failed to generate replacement for word "${wordInfo.text}" at index ${wordIndex}`);
      }
    });
    
    return result.join('');
  }

  /**
   * Processes HTML content while preserving structure
   * @param {string} html - HTML content to process
   * @param {string} seed - Seed for deterministic scrambling
   * @returns {string} - HTML with scrambled text content
   */
  scrambleHtmlContent(html, seed) {
    if (!html) return html;

    let textBlockIndex = 0;
    
    // Regular expression to match text content outside of HTML tags
    // This preserves HTML structure while only scrambling text content
    return html.replace(/>([^<]+)</g, (match, textContent) => {
      // Skip if this is just whitespace or contains only HTML entities
      if (!textContent.trim() || /^[\s&\w;]*$/.test(textContent.trim())) {
        return match;
      }
      
      // Create unique seed for each text block to ensure variety
      const blockSeed = seed + '_block_' + textBlockIndex.toString() + '_' + textContent.length.toString();
      textBlockIndex++;
      
      const scrambled = this.scrambleText(textContent, blockSeed);
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
      // Generate deterministic seed from the request path
      const seed = this.generateSeedFromPath(requestPath);
      
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
      
      // Try multiple potential file paths for Jekyll-style URLs
      const potentialPaths = [
        path.join(this.blogStaticDir, filePath),
        path.join(this.blogStaticDir, filePath, 'index.html'),
        path.join(this.blogStaticDir, filePath + '.html'),
        path.join(this.blogStaticDir, filePath + '/index.html')
      ];
      
      let resolvedPath = null;
      let content = null;
      
      // Try each potential path
      for (const potentialPath of potentialPaths) {
        const resolved = path.resolve(potentialPath);
        const resolvedBlogDir = path.resolve(this.blogStaticDir);
        
        // Security check: ensure the path is within the blog directory
        if (!resolved.startsWith(resolvedBlogDir)) {
          continue;
        }
        
        // Check if file exists and is a file (not directory)
        if (fs.existsSync(resolved)) {
          const stat = fs.statSync(resolved);
          if (stat.isFile()) {
            resolvedPath = resolved;
            content = fs.readFileSync(resolved, 'utf8');
            break;
          }
        }
      }
      
      if (!content) {
        console.log(`No suitable file found for scrambling: ${requestPath}, using default scrambled page`);
        // Return default scrambled page instead of null
        return this.createDefaultScrambledPage(requestPath);
      }
      
      // Scramble the content with deterministic seed
      let scrambledContent = this.scrambleHtmlContent(content, seed);
      
      // Add random blog links at the bottom of the page
      scrambledContent = this.addRandomBlogLinks(scrambledContent, seed);
      
      console.log(`Served Markov-scrambled content for: ${requestPath} (seed: ${seed.substring(0, 8)}...)`);
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
    const seed = this.generateSeedFromPath(requestPath);
    
    // Generate realistic words for the title and content
    const seededRandom = new SeededRandom(seed);

    const titleWords = markovChain.generateWords(seededRandom.randomInt(3, 12), seed + '_title');
    const title = `${titleWords[0].charAt(0).toUpperCase() + titleWords[0].slice(1)} ${titleWords[1]} ${titleWords[2]} - ${requestPath}`;
    const paragraphs = [];
    const paragraphCount = seededRandom.randomInt(5, 30);

    for (let i = 0; i < paragraphCount; i++) {
      const contentWords = markovChain.generateWords(seededRandom.randomInt(15, 30), seed + '_content_' + i);
      paragraphs.push(this.formatSentences(contentWords));
    }

    const paragraphsText = paragraphs.map(p => `<p>${p}</p>`).join('\n\n');
    
    // Generate random blog links
    const blogLinks = this.generateRandomBlogLinks(seed);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            background-color: #f8f9fa;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
        }
        p {
            margin: 20px 0;
        }
        a {
            color: #3498db;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .blog-links {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
        .blog-links h3 {
            color: #7f8c8d;
            font-size: 14px;
            margin-bottom: 15px;
        }
        .blog-links ul {
            list-style: none;
            padding: 0;
        }
        .blog-links li {
            margin: 8px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${titleWords[0].charAt(0).toUpperCase() + titleWords[0].slice(1)} ${titleWords[1]} ${titleWords[2]}</h1>

        ${paragraphsText}

        <p><a href="/">Return to home</a> | <a href="/about.html">About us</a> | <a href="/contact.html">Contact</a></p>
        
        <div class="blog-links">
            <h3>Related Articles</h3>
            <ul>
                ${blogLinks}
            </ul>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Format an array of words into sentences with proper capitalization and punctuation
   * @param {string[]} words - Array of words
   * @returns {string} - Formatted sentences
   */
  formatSentences(words) {
    if (words.length === 0) return '';
    
    let result = '';
    let currentSentence = [];
    const sentenceLength = 8 + Math.floor(words.length / 20 * 5); // Variable sentence length
    
    for (let i = 0; i < words.length; i++) {
      currentSentence.push(words[i]);
      
      if (currentSentence.length >= sentenceLength || i === words.length - 1) {
        // Capitalize first word
        if (currentSentence.length > 0) {
          currentSentence[0] = currentSentence[0].charAt(0).toUpperCase() + currentSentence[0].slice(1);
        }
        
        result += currentSentence.join(' ') + '. ';
        currentSentence = [];
      }
    }
    
    return result.trim();
  }

  /**
   * Generate random blog links with 4-5 word titles
   * @param {string} seed - Seed for deterministic randomization
   * @returns {string} - HTML list items with blog links
   */
  generateRandomBlogLinks(seed) {
    const seededRandom = new SeededRandom(seed + '_bloglinks');
    const links = [];
    
    for (let i = 0; i < 5; i++) {
      const wordCount = seededRandom.randomInt(4, 6); // 4 to 5 words
      const words = markovChain.generateWords(wordCount, seed + '_link_' + i);
      const title = words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      const url = `/blog/${words.join('-')}/`;
      
      links.push(`<li><a href="${url}">${title}</a></li>`);
    }
    
    return links.join('\n                ');
  }

  /**
   * Add random blog links to existing HTML content
   * @param {string} html - HTML content
   * @param {string} seed - Seed for deterministic randomization
   * @returns {string} - HTML with added blog links
   */
  addRandomBlogLinks(html, seed) {
    const blogLinks = this.generateRandomBlogLinks(seed);
    
    // Find the closing body tag and insert the blog links before it
    const blogLinksHtml = `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
        <h3 style="color: #7f8c8d; font-size: 14px; margin-bottom: 15px;">Related Articles</h3>
        <ul style="list-style: none; padding: 0;">
            ${blogLinks}
        </ul>
    </div>`;
    
    // Insert before closing body tag, or at the end if no body tag found
    if (html.includes('</body>')) {
      return html.replace('</body>', `${blogLinksHtml}\n</body>`);
    } else {
      return html + blogLinksHtml;
    }
  }

  /**
   * Main method to get scrambled content for a request
   * @param {string} requestPath - The requested path
   * @returns {Promise<{content: string, contentType: string}>} - Scrambled content and type
   */
  async getScrambledResponse(requestPath) {
    // Always get content - either from actual file or default scrambled page
    const content = await this.getScrambledContent(requestPath);
    
    return {
      content,
      contentType: 'text/html; charset=utf-8'
    };
  }
}

module.exports = new ContentScrambler();
