/**
 * Normalises every common way of writing an Ethiopian mobile number to +2519XXXXXXXX / +2517XXXXXXXX,
 * so the same person cannot be registered twice with different formatting.
 */
export function normalizePhone(input: string): string | null {
  let d = String(input ?? "").replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00251")) d = d.slice(2);
  if (d.startsWith("251")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^[79]\d{8}$/.test(d) ? `+251${d}` : null;
}

export function displayPhone(normalized: string): string {
  return normalized.startsWith("+251") ? `0${normalized.slice(4)}` : normalized;
}
