export const SITE_NAME = "Shagun";
export const SITE_DESCRIPTION = "Find Vivah Bhawans, marriage halls and wedding venues, city by city. Useful details, open contact information and no sign-up.";
export function isConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
export function indexingEnabled(): boolean {
  return isConfigured() && process.env.SHAGUN_TEST_FIXTURES !== "true" &&
    /^https:\/\//.test(siteUrl()) && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production");
}
export function fixtureMode(): boolean {
  if (process.env.SHAGUN_TEST_FIXTURES !== "true") return false;
  if (process.env.VERCEL || isConfigured() || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(siteUrl())) {
    throw new Error("Test fixtures are only allowed locally, without a connected database.");
  }
  return true;
}