/** Every user-facing error is Amharic. */
export class AppError extends Error {
  constructor(public status: number, message: string, public code = "ERROR") { super(message); }
}
export const badRequest = (m = "የገባው መረጃ ትክክል አይደለም።") => new AppError(400, m, "BAD_REQUEST");
export const unauthorized = (m = "እባክዎ መጀመሪያ ይግቡ።") => new AppError(401, m, "UNAUTHORIZED");
export const forbidden = (m = "ይህን ተግባር ለማከናወን ፈቃድ የለዎትም።") => new AppError(403, m, "FORBIDDEN");
export const notFound = (m = "የሚፈለገው መረጃ አልተገኘም።") => new AppError(404, m, "NOT_FOUND");
export const conflict = (m: string) => new AppError(409, m, "CONFLICT");
