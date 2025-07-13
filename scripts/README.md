# Database Management

This directory contains the consolidated database initialization and migration scripts for the crawler honeypot project.

## Files Overview

### Core Files

- **`init-database.js`** - Consolidated database schema initialization class
- **`migrate.js`** - Migration script for updating existing databases
- **`test-init.js`** - Test script to verify database initialization

### Legacy Files (Deprecated)

- `setup-db.js` - Original database setup script
- `add-block-reason-column.js` - Column addition script
- `add-settings-table.js` - Settings table creation script
- `create-good-agents-table.js` - Good agents table creation script

## How It Works

The database system now automatically initializes the schema when needed:

1. **Automatic Initialization**: When `DatabaseAdapter` is instantiated, it automatically checks if the schema exists
2. **Schema Detection**: Looks for the presence of the `known_bad_agents` table as an indicator
3. **Auto-Setup**: If tables are missing, automatically runs the full schema initialization
4. **Default Data**: Inserts default bad agents, good agents, and settings during initialization

## Database Schema

The system creates the following tables:

### `known_bad_agents`

- Stores user agent patterns that should be blocked
- Pre-populated with common bot/scraper patterns

### `known_good_agents`

- Stores legitimate user agent patterns (search engines, social media bots)
- Pre-populated with major search engines and social platforms

### `request_logs`

- Logs all incoming requests with analysis data
- Includes user tracking, rate limiting counters, and block reasons

### `settings`

- Configurable application settings
- Pre-populated with default honeypot configuration

## Usage

### For New Projects

Simply instantiate the `DatabaseAdapter` - schema will be created automatically:

```javascript
const DatabaseAdapter = require("./database");
const db = new DatabaseAdapter();
// Schema is automatically initialized on first use
```

### For Existing Projects

Run the migration script to safely update existing databases:

```bash
node scripts/migrate.js
```

### Testing

Verify database initialization is working:

```bash
node scripts/test-init.js
```

## Migration from Legacy Scripts

If you were previously using the individual setup scripts, you can now:

1. Remove manual script execution from your workflow
2. Run `node scripts/migrate.js` once to ensure your database is up to date
3. The system will handle all future schema management automatically

## Database Support

The system supports both:

- **SQLite** (default) - File-based database for development
- **PostgreSQL** - For production deployments

The initialization scripts automatically adapt SQL syntax for the target database type.
