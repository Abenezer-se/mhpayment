export const env = {
  get databaseUrl() {
    const v = process.env.DATABASE_URL;
    if (!v) throw new Error("DATABASE_URL አልተቀመጠም።");
    return v;
  },
  get authSecret() {
    const v = process.env.AUTH_SECRET;
    if (!v || v.length < 32) throw new Error("AUTH_SECRET (ቢያንስ 32 ፊደላት) አልተቀመጠም።");
    return new TextEncoder().encode(v);
  },
  get sessionHours() { return Number(process.env.SESSION_HOURS || 12); },
  get maxUploadBytes() { return Math.max(1, Number(process.env.MAX_UPLOAD_MB || 4)) * 1024 * 1024; },
  get isProd() { return process.env.NODE_ENV === "production" || process.env.NETLIFY === "true" || !!process.env.AWS_LAMBDA_FUNCTION_NAME; },
  get storageDriver(): "netlify" | "local" {
    const v = process.env.STORAGE_DRIVER;
    if (v === "netlify" || v === "local") return v;
    return process.env.NETLIFY === "true" ? "netlify" : "local";
  },
  get localUploadDir() { return process.env.LOCAL_UPLOAD_DIR || ".data/uploads"; },
};
