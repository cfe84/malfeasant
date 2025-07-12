const db = require('../database');

async function createGoodAgentsTable() {
  try {
    console.log('Creating known_good_agents table...');
    
    if (db.dbType === 'sqlite') {
      // SQLite syntax
      await db.query(`
        CREATE TABLE IF NOT EXISTS known_good_agents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_agent VARCHAR(500) UNIQUE NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      // PostgreSQL syntax
      await db.query(`
        CREATE TABLE IF NOT EXISTS known_good_agents (
          id SERIAL PRIMARY KEY,
          user_agent VARCHAR(500) UNIQUE NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    
    console.log('Good agents table created successfully!');
    
    // Add some default good agents
    const defaultGoodAgents = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Twitterbot/1.0',
      'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com/)',
      'WhatsApp/2.0'
    ];
    
    console.log('Adding default good agents...');
    for (const agent of defaultGoodAgents) {
      try {
        if (db.dbType === 'sqlite') {
          await db.query(
            'INSERT OR IGNORE INTO known_good_agents (user_agent, is_active) VALUES (?, ?)',
            [agent, 1]
          );
        } else {
          await db.query(
            'INSERT INTO known_good_agents (user_agent, is_active) VALUES (?, ?) ON CONFLICT (user_agent) DO NOTHING',
            [agent, true]
          );
        }
      } catch (error) {
        // Ignore duplicate errors
        if (!error.message.includes('UNIQUE constraint failed') && 
            !error.message.includes('duplicate key value')) {
          console.error(`Error adding agent ${agent}:`, error);
        }
      }
    }
    
    console.log('Default good agents added successfully!');
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('Good agents table already exists, skipping...');
    } else {
      console.error('Error creating good agents table:', error);
      throw error;
    }
  }
}

if (require.main === module) {
  createGoodAgentsTable()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createGoodAgentsTable };
