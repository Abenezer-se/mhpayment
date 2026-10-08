import { Router } from "express";
import { makeIcon } from "../lib/icon";

export const pwaApi = Router();
const cache = new Map<number, Buffer>();

pwaApi.get("/icon-:size.png", (req, res) => {
  const size = Number(req.params.size);
  if (![180, 192, 512].includes(size)) return res.status(404).end();
  if (!cache.has(size)) cache.set(size, makeIcon(size));
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.end(cache.get(size));
});