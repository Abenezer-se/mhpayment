export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

type Params = Record<string, string | number | boolean | undefined | null | object>;

/** Query string from a params object; empty values / "all" are skipped. Ethiopian dates are sent as Y-M-D. */
export function qs(p: Params = {}): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === "" || v === "all") continue;
    if (typeof v === "object") { const d = v as any; if (d.year && d.month && d.day) u.set(k, `${d.year}-${d.month}-${d.day}`); continue; }
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function request<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method, credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, "ከአገልጋዩ ጋር መገናኘት አልተቻለም። እባክዎ ኢንተርኔትዎን ያረጋግጡ።");
  }
  const isJson = (res.headers.get("content-type") || "").includes("json");
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/login")) onUnauthorized?.();
    throw new ApiError(res.status, data?.error?.message || "ያልታሰበ ስህተት ተፈጥሯል። እባክዎ ደግመው ይሞክሩ።", data?.error?.code);
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string, params?: Params) => request<T>("GET", path + qs(params)),
  post: <T = any>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  put: <T = any>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: <T = any>(path: string) => request<T>("DELETE", path),
  upload: <T = any>(path: string, form: FormData, method = "POST") => request<T>(method, path, undefined, form),
};

/** Download = plain navigation; the session cookie authorises it and the server sends Content-Disposition. */
export const downloadUrl = (path: string, params?: Params) => `/api${path}${qs(params)}`;
export const startDownload = (path: string, params?: Params) => { window.location.href = downloadUrl(path, params); };

/** Phone screenshots are often 3–8 MB. Shrink images in the browser so uploads are fast and fit Netlify's request limit. */
export async function prepareProof(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 900 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (blob && blob.size < file.size) return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { /* fall back to the original */ }
  return file;
}
