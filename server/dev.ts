// Plain Node entry point: local development AND any traditional Node host (Render, Railway, VPS …).
import path from "node:path";
import fs from "node:fs";
import express from "express";
import { createApp } from "./app";

const app = createApp();
const dist = path.resolve(process.cwd(), "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}
const port = Number(process.env.PORT || 8888);
app.listen(port, () => console.log(`✓ API: http://localhost:${port}/api/health`));
