// Loaded before every test file. Points the app at the isolated test database.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://servebell:servebell_dev_password@localhost:5432/servebell_test?schema=public';
process.env.PUBLIC_WEB_URL = 'http://localhost:3000';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_SECRET_KEY = '';
process.env.TOKEN_HASH_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.CORS_ORIGINS = 'http://localhost:3000';
