# Malfeasant

A Node.js-based honeypot system designed to detect and block web crawlers while allowing legitimate visitors to access your blog content, freely inspired from [Spigot](https://www.ty-penguin.org.uk/~auj/spigot/). Mostly "vibe-coded" for maximum irony.

## Features

- **Intelligent Bot Detection**: Uses user agent analysis and behavioral patterns to identify crawlers
- **Smart Rate Limiting**: Configurable limits that exclude API/dashboard requests from counting
- **Dual Static Content**: Separate serving for honeypot content and actual blog content
- **Scramble Parameter Testing**: Add `?scramble` to any URL to test blocking functionality
- **Dual Database Support**: SQLite for local development, PostgreSQL for production
- **Real-time Dashboard**: Monitor bot activity and view statistics with API authentication
- **Automatic Redirects**: Suspicious requests are automatically redirected to a specified URL
- **Known Bad Agents Management**: Full CRUD operations for managing malicious user agents

## Architecture

The system consists of several key components:

- **server.js**: Main Express.js server handling requests and middleware
- **robot.js**: Core bot detection logic and rate limiting
- **database.js**: PostgreSQL connection and management
- **Dashboard**: Real-time monitoring interface

## Installation

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd crawler-honeypot
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Copy `.env.example` to `.env` and configure your settings:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your preferences:

   ```
   # For local development (default)
   DB_TYPE=sqlite
   SQLITE_DB_PATH=./honeypot.db

   # For production with PostgreSQL
   DB_TYPE=postgres
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=honeypot_db
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   ```

4. **Set up database**:
   The system supports both SQLite (for local development) and PostgreSQL (for production):

   **For SQLite (recommended for local development):**

   ```bash
   npm run setup-db
   ```

   **For PostgreSQL (production):**

   - Create a PostgreSQL database
   - Set `DB_TYPE=postgres` in your `.env` file
   - Configure database credentials in `.env`
   - Run the setup script:

   ```bash
   npm run setup-db
   ```

5. **Start the server**:

   ```bash
   npm start
   ```

   For development with auto-reload:

   ```bash
   npm run dev
   ```

## Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)
- `DB_TYPE`: Database type - 'sqlite' or 'postgres' (default: sqlite)
- `SQLITE_DB_PATH`: SQLite database file path (default: ./honeypot.db)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: PostgreSQL connection (when using postgres)
- `HONEYPOT_STATIC_DIR`: Directory for honeypot static content (default: ./public)
- `BLOG_STATIC_DIR`: Directory for blog static content (default: ./blog)
- `BLOG_ROUTE_PREFIX`: URL prefix for blog content (default: /blog)
- `RATE_LIMIT_SHORT_WINDOW`: Short-term rate limit window in ms (default: 60000 = 1 minute)
- `RATE_LIMIT_SHORT_MAX`: Max requests in short window (default: 10)
- `RATE_LIMIT_LONG_WINDOW`: Long-term rate limit window in ms (default: 900000 = 15 minutes)
- `RATE_LIMIT_LONG_MAX`: Max requests in long window (default: 25)
- `REDIRECT_URL`: URL to redirect blocked requests
- `HONEYPOT_SECRET`: Secret key for user ID generation
- `API_SECRET`: Secret key for dashboard API access

### Rate Limiting

The system applies intelligent rate limiting:

- **Counted towards limits**: HTML content requests to blog and honeypot content
- **Excluded from limits**: API endpoints (`/api/*`), dashboard (`/dashboard.html`), static assets (CSS, JS, images)
- **Instant blocking**: Any request with `?scramble` parameter
- **Smart detection**: Only legitimate content requests are rate-limited

### Static Content Structure

The system serves content from two separate directories:

- **Honeypot Content** (`./public/` by default): Demo/trap content served at root level
- **Blog Content** (`./blog/` by default): Your actual blog content served at `/blog` prefix
- **Dashboard**: Administrative interface at `/dashboard.html`

Example URL structure:

```
/                    → Honeypot content (public/index.html)
/about.html          → Honeypot content (public/about.html)
/blog/               → Blog content (blog/index.html)
/blog/about.html     → Blog content (blog/about.html)
/dashboard.html      → Dashboard (excluded from rate limiting)
/api/stats           → API endpoint (excluded from rate limiting)
```

## How It Works

1. **Request Analysis**: Each incoming request is analyzed for:

   - User agent patterns
   - IP address
   - Request frequency
   - Content type being requested

2. **Bot Detection**:

   - Checks against known bad user agents database
   - Applies rate limiting for HTML requests
   - Generates unique user IDs based on IP + User Agent

3. **Action Taken**:

   - Legitimate requests: Serve content normally
   - Suspicious requests: Redirect to specified URL
   - All requests: Log to database for analysis

4. **Analytics**:
   - Real-time dashboard at `/dashboard.html`
   - API endpoints for statistics
   - Comprehensive request logging

## API Endpoints

- `GET /api/stats`: Get request statistics and analytics
- `POST /api/bad-agent`: Add a new bad user agent to the database

## Database Schema

### known_bad_agents

- `id`: Primary key
- `user_agent`: User agent string
- `is_active`: Whether the agent is currently blocked
- `created_at`, `updated_at`: Timestamps

### request_logs

- `id`: Primary key
- `user_id`: Generated user identifier
- `user_agent`: Full user agent string
- `ip_address`: Client IP address
- `request_url`: Requested URL
- `referrer`: HTTP referrer
- `was_request_redirected`: Whether request was blocked
- `request_count_short_counter`: Count in short window
- `request_count_long_counter`: Count in long window
- `created_at`: Request timestamp

## Static Content

Place your blog's static content in the `public/` directory:

- `index.html`: Main page
- `about.html`: About page
- `dashboard.html`: Analytics dashboard
- Other HTML, CSS, JS, and media files

## Security Considerations

- The system uses IP + User Agent hashing for user identification
- Database queries are parameterized to prevent SQL injection
- Rate limiting prevents abuse while allowing legitimate access
- Configurable redirect URLs keep malicious traffic away from your content

## Monitoring

Access the dashboard at `/dashboard.html` to view:

- Total request counts
- Blocked request statistics
- Top user agents
- Recent request activity
- Real-time updates

## Customization

- **Add new bad agents**: Use the API or directly insert into the database
- **Adjust rate limits**: Modify environment variables
- **Custom redirect logic**: Edit the `robot.js` file
- **Enhanced detection**: Add new rules to the `getContent` function

## Development

The system is built with:

- Node.js & Express.js
- SQLite (development) / PostgreSQL (production)
- Modern JavaScript (ES6+)
- Responsive HTML/CSS dashboard

For development:

```bash
npm run dev  # Start with nodemon for auto-reload
```

## License

MIT License - feel free to use and modify for your own projects.
