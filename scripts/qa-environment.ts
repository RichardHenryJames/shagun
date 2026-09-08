export const QA_ORIGIN = "http://localhost:3100";

/** One origin/environment for BOTH compilation and runtime; never connect test UI to a real DB. */
export function qaEnvironment(): Record<string, string> {
  if (process.env.VERCEL) throw new Error("Local QA must not run on Vercel.");
  const scenario = process.env.SHAGUN_FIXTURE_SCENARIO ?? "many";
  if (!["empty", "one", "many"].includes(scenario)) throw new Error("Choose the empty, one or many fixture scenario.");
  return {
    NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SITE_URL: QA_ORIGIN,
    SHAGUN_TEST_FIXTURES: "true", SHAGUN_FIXTURE_SCENARIO: scenario,
    NEXT_PUBLIC_ANALYTICS_ENABLED: "false", NEXT_PUBLIC_CONTACT_EMAIL: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "", NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_URL: "", SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_SECRET_KEY: "", DATABASE_URL: "", DIRECT_URL: "",
    POSTGRES_URL: "", POSTGRES_PRISMA_URL: "", RATE_LIMIT_SECRET: "",
  };
}