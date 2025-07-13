const fs = require('fs');
const path = require('path');
const SeededRandom = require('./seeded-random');

class MarkovChain {
  constructor() {
    this.chains = new Map(); // word -> {nextWord: count, ...}
    this.totalTransitions = 0;
    this.words = new Set(); // all unique words
    this.blogStaticDir = path.join(__dirname, process.env.BLOG_STATIC_DIR || 'blog');
    this.isIndexed = false;
  }

  /**
   * Extract text content from HTML, removing tags and getting clean words
   * @param {string} html - HTML content
   * @returns {string[]} - Array of words
   */
  extractWordsFromHtml(html) {
    if (!html) return [];
    
    // Remove HTML tags and get text content
    const textContent = html
      .replace(/<script[^>]*>.*?<\/script>/gis, '') // Remove script tags
      .replace(/<style[^>]*>.*?<\/style>/gis, '')   // Remove style tags
      .replace(/<[^>]*>/g, ' ')                     // Remove all other HTML tags
      .replace(/&[a-zA-Z0-9#]+;/g, ' ')            // Remove HTML entities
      .replace(/\s+/g, ' ')                        // Normalize whitespace
      .trim();
    
    // Extract words (letters, numbers, apostrophes)
    const words = textContent
      .toLowerCase()
      .match(/[a-z0-9']+/g) || [];
    
    return words.filter(word => word.length > 0);
  }

  /**
   * Build Markov chain from a list of words
   * @param {string[]} words - Array of words
   */
  buildChainFromWords(words) {
    for (let i = 0; i < words.length - 1; i++) {
      const currentWord = words[i];
      const nextWord = words[i + 1];
      
      this.words.add(currentWord);
      this.words.add(nextWord);
      
      if (!this.chains.has(currentWord)) {
        this.chains.set(currentWord, new Map());
      }
      
      const transitions = this.chains.get(currentWord);
      const currentCount = transitions.get(nextWord) || 0;
      transitions.set(nextWord, currentCount + 1);
      
      this.totalTransitions++;
    }
  }

  /**
   * Recursively scan directory for HTML files and build index
   * @param {string} directory - Directory to scan
   */
  async scanDirectory(directory) {
    try {
      const items = fs.readdirSync(directory);
      
      for (const item of items) {
        const fullPath = path.join(directory, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Recursively scan subdirectories
          await this.scanDirectory(fullPath);
        } else if (stat.isFile() && item.match(/\.(html|htm)$/i)) {
          // Process HTML files
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const words = this.extractWordsFromHtml(content);
            this.buildChainFromWords(words);
            console.log(`Indexed ${words.length} words from ${fullPath}`);
          } catch (error) {
            console.error(`Error reading file ${fullPath}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${directory}:`, error.message);
    }
  }

  /**
   * Build the Markov chain index from all HTML files in the blog directory
   */
  async buildIndex() {
    console.log('Building Markov chain index from blog content...');
    this.chains.clear();
    this.words.clear();
    this.totalTransitions = 0;
    
    try {
      await this.scanDirectory(this.blogStaticDir);
      this.isIndexed = true;
      
      console.log(`Markov index built: ${this.words.size} unique words, ${this.totalTransitions} transitions, ${this.chains.size} chain entries`);
    } catch (error) {
      console.error('Error building Markov index:', error);
      this.isIndexed = false;
    }
  }

  /**
   * Get next word based on current word and probability distribution
   * @param {string} currentWord - Current word
   * @param {SeededRandom} seededRandom - Seeded random number generator
   * @returns {string|null} - Next word or null if no transitions found
   */
  getNextWord(currentWord, seededRandom) {
    const transitions = this.chains.get(currentWord.toLowerCase());
    if (!transitions || transitions.size === 0) {
      return null;
    }
    
    // Convert to array for easier manipulation
    const transitionArray = Array.from(transitions.entries());
    
    // Add some randomness by occasionally picking less probable words
    const useRareWord = seededRandom.random() < 0.15; // 15% chance to pick a rare word
    
    if (useRareWord && transitionArray.length > 1) {
      // Sort by count (ascending) and pick from the lower probability words
      transitionArray.sort((a, b) => a[1] - b[1]);
      const lowerHalf = transitionArray.slice(0, Math.ceil(transitionArray.length / 2));
      return seededRandom.pick(lowerHalf)[0];
    }
    
    // Normal weighted random selection
    let totalCount = 0;
    for (const [, count] of transitionArray) {
      totalCount += count;
    }
    
    // Generate random number and find corresponding word
    const randomValue = seededRandom.random() * totalCount;
    let accumulator = 0;
    
    for (const [nextWord, count] of transitionArray) {
      accumulator += count;
      if (randomValue <= accumulator) {
        return nextWord;
      }
    }
    
    // Fallback: return last word
    return transitionArray[transitionArray.length - 1][0];
  }

  /**
   * Get a random starting word
   * @param {SeededRandom} seededRandom - Seeded random number generator
   * @returns {string} - Random word from vocabulary
   */
  getRandomWord(seededRandom) {
    const wordsArray = Array.from(this.words);
    if (wordsArray.length === 0) return 'the';
    
    const selectedWord = seededRandom.pick(wordsArray);
    
    // Ensure we always return a valid string
    return (selectedWord && typeof selectedWord === 'string') ? selectedWord : 'the';
  }

  /**
   * Generate a sequence of words using Markov chain
   * @param {number} length - Number of words to generate
   * @param {string} seed - Seed for random generation
   * @param {string} startWord - Optional starting word
   * @returns {string[]} - Array of generated words
   */
  generateWords(length, seed, startWord = null) {
    if (!this.isIndexed || this.words.size === 0) {
      // Fallback to simple word list if index not ready
      const fallbackWords = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog', 'and', 'runs', 'through', 'forest'];
      const seededRandom = new SeededRandom(seed);
      const result = [];
      
      for (let i = 0; i < length; i++) {
        result.push(seededRandom.pick(fallbackWords));
      }
      
      return result;
    }
    
    const seededRandom = new SeededRandom(seed);
    const result = [];
    const usedWords = new Set(); // Track used words to avoid immediate repetition
    let consecutiveRepeats = 0;
    const maxConsecutiveRepeats = 2;
    
    // Start with provided word or random word
    let currentWord = startWord ? startWord.toLowerCase() : this.getRandomWord(seededRandom);
    result.push(currentWord);
    usedWords.add(currentWord);
    
    // Generate remaining words
    for (let i = 1; i < length; i++) {
      let nextWord = this.getNextWord(currentWord, seededRandom);
      let attempts = 0;
      const maxAttempts = 5;
      
      // Try to avoid recently used words and prevent getting stuck
      while (attempts < maxAttempts && nextWord) {
        // If we've used this word recently or hit too many consecutive repeats, try again
        if (usedWords.has(nextWord) && usedWords.size < this.words.size * 0.1) {
          nextWord = this.getNextWord(currentWord, seededRandom);
          attempts++;
        } else {
          break;
        }
      }
      
      if (nextWord) {
        result.push(nextWord);
        usedWords.add(nextWord);
        
        // Reset consecutive repeats counter if we got a new word
        if (nextWord !== currentWord) {
          consecutiveRepeats = 0;
        } else {
          consecutiveRepeats++;
        }
        
        currentWord = nextWord;
      } else {
        // If we hit a dead end, start with a new random word
        consecutiveRepeats++;
      }
      
      // If we're getting too repetitive, force a restart with random word
      if (consecutiveRepeats >= maxConsecutiveRepeats) {
        currentWord = this.getRandomWord(seededRandom);
        // Try to pick a word we haven't used recently
        let randomAttempts = 0;
        while (usedWords.has(currentWord) && randomAttempts < 10 && usedWords.size < this.words.size * 0.5) {
          currentWord = this.getRandomWord(seededRandom);
          randomAttempts++;
        }
        // Only add if we actually got a valid word
        if (currentWord && typeof currentWord === 'string') {
          result.push(currentWord);
          usedWords.add(currentWord);
        }
        consecutiveRepeats = 0;
      }
      
      // Clear used words tracking if we've used too many (to allow recycling)
      if (usedWords.size > this.words.size * 0.2) {
        usedWords.clear();
      }
    }
    
    return result;
  }

  /**
   * Get statistics about the Markov chain
   * @returns {object} - Statistics object
   */
  getStats() {
    return {
      isIndexed: this.isIndexed,
      totalWords: this.words.size,
      totalTransitions: this.totalTransitions,
      chainEntries: this.chains.size,
      avgTransitionsPerWord: this.chains.size > 0 ? this.totalTransitions / this.chains.size : 0
    };
  }
}

module.exports = new MarkovChain();
