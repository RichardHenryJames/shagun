// Application-owned namespaces in a shared Supabase project. Keep this module
// dependency-free so the proxy, CLI and cleanup action do not load server/Sharp code.
export const DB_SCHEMA = "shagun";
export const MEDIA_BUCKET = "shagun-media";
export const ADMIN_COOKIE_NAME = "shagun-admin-auth";