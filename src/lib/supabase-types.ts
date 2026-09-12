// Minimal Database type for the parts of Supabase we touch (auth + storage).
// Storage buckets are dynamic so we keep this light.
export type Database = Record<string, never>
