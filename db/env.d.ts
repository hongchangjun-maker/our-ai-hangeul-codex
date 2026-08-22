declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ADMIN_PASSWORD_HASH?: string;
    SESSION_SECRET?: string;
    SETTINGS_ENCRYPTION_KEY?: string;
    OPENAI_API_KEY?: string;
    APP_ENV?: string;
    COLLAB_WORKER_URL?: string;
  }
}
