import cookieParser from "cookie-parser";
import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { authenticate, sameOriginOnly } from "./lib/auth";
import { AppError } from "./lib/errors";
import { auth, publicApi } from "./routes/auth";
import { auditApi, configApi, staffApi } from "./routes/config";
import { followupApi } from "./routes/followup";
import { meYearsApi } from "./routes/me-years";
import { memberListApi } from "./routes/member-list";
import { membersApi } from "./routes/members";
import { dashboardApi, meApi, paymentsApi } from "./routes/payments";
import { pwaApi } from "./routes/pwa";
import { reportsApi } from "./routes/reports";

export function createApp() {
  const app = express();
  app.set("trust proxy", true);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(sameOriginOnly);
  api.use(authenticate);
  api.get("/health", (_req, res) => res.json({ ok: true }));
  api.use("/public", publicApi);
  api.use("/public", pwaApi);
  api.use("/auth", auth);
  api.use("/config", configApi);
  api.use("/staff", staffApi);
  api.use("/audit", auditApi);
  api.use("/members", membersApi);
  api.use("/followup", followupApi);
  api.use("/member-list", memberListApi);
  api.use("/payments", paymentsApi);
  api.use("/me", meYearsApi);
  api.use("/me", meApi);
  api.use("/dashboard", dashboardApi);
  api.use("/reports", reportsApi);
  api.use((_req, _res, next) => next(new AppError(404, "የሚፈለገው መረጃ አልተገኘም።", "NOT_FOUND")));

  // Netlify rewrites /api/* to /.netlify/functions/api/*; serve both so the app is portable to any Node host.
  app.use(["/api", "/.netlify/functions/api"], api);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: { message: err.message, code: err.code } });
    if (err instanceof ZodError) {
      // zod's built-in messages are English; anything we did not write ourselves becomes a generic Amharic message
      const m = err.issues[0]?.message;
      const message = m && /[\u1200-\u137F]/.test(m) ? m : "የገባው መረጃ ትክክል አይደለም።";
      return res.status(400).json({ error: { message, code: "VALIDATION" } });
    }
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "ፋይሉ በጣም ትልቅ ነው። ትንሽ ምስል ይጠቀሙ።" : "የክፍያ ማረጋገጫ ምስሉ አልተጫነም።";
      return res.status(400).json({ error: { message: msg, code: "UPLOAD" } });
    }
    if ((err as any)?.type === "entity.parse.failed") return res.status(400).json({ error: { message: "የገባው መረጃ ትክክል አይደለም።", code: "BAD_JSON" } });
    const pgCode = (err as any)?.code;
    if (pgCode === "23505") return res.status(409).json({ error: { message: "ይህ መረጃ ቀድሞ ተመዝግቧል።", code: "DUPLICATE" } });
    console.error(err);
    res.status(500).json({ error: { message: "ያልታሰበ ስህተት ተፈጥሯል። እባክዎ ደግመው ይሞክሩ።", code: "INTERNAL" } });
  });
  return app;
}