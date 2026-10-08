import serverless from "serverless-http";
import { createApp } from "../../server/app";

process.env.STORAGE_DRIVER ??= "netlify";

const isBinary = (headers: Record<string, any>) => {
  const t = String(headers["content-type"] ?? "");
  return /^image\//.test(t) || t.includes("pdf") || t.includes("spreadsheetml") || t.includes("octet-stream");
};
const app = serverless(createApp(), { binary: isBinary as any });

export const handler = async (event: any, context: any) => {
  // Netlify Blobs (payment screenshots) needs the function's environment in the Lambda-compatible runtime.
  try {
    const { connectLambda } = await import("@netlify/blobs");
    connectLambda(event);
  } catch { /* not running on Netlify */ }
  return (app as any)(event, context);
};
