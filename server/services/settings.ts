import { Db, query } from "../db";

export interface Settings {
  orgName: string; orgParent: string; orgPhone: string; orgEmail: string; orgAddress: string; orgDescription: string;
  logoKey: string | null; logoMime: string | null; billPagumen: boolean; systemStartYear: number;
}

const DEFAULTS: Settings = {
  orgName: "መሠረተ ሕይወት ሰንበት ትምህርት ቤት", orgParent: "የደብረሰላም መድኃኔዓለም ካቴድራል", orgPhone: "", orgEmail: "", orgAddress: "", orgDescription: "",
  logoKey: null, logoMime: null, billPagumen: false, systemStartYear: 2019,
};
const KEYS: Record<keyof Settings, string> = {
  orgName: "org_name", orgParent: "org_parent", orgPhone: "org_phone", orgEmail: "org_email", orgAddress: "org_address",
  orgDescription: "org_description", logoKey: "logo_key", logoMime: "logo_mime",
  billPagumen: "bill_pagumen", systemStartYear: "system_start_year",
};

export async function getSettings(db?: Db): Promise<Settings> {
  const { rows } = await query<{ key: string; value: any }>("select key, value from organization_settings", [], db);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out: any = { ...DEFAULTS };
  for (const [prop, key] of Object.entries(KEYS)) if (map.has(key)) out[prop] = map.get(key);
  return out as Settings;
}

export async function setSetting(db: Db, key: string, value: unknown, userId: string | null) {
  await query(
    `insert into organization_settings (key, value, updated_by, updated_at) values ($1, $2::jsonb, $3, now())
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), userId], db);
}

export async function getRawSetting<T>(db: Db, key: string): Promise<T | null> {
  const { rows } = await query("select value from organization_settings where key = $1", [key], db);
  return rows[0] ? (rows[0].value as T) : null;
}
export { KEYS as SETTING_KEYS };
