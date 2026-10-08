import { Db, query } from "../db";
import type { SessionUser } from "./auth";

export async function audit(
  db: Db, user: Pick<SessionUser, "id" | "fullName"> | null, action: string,
  entityType?: string, entityId?: string | number, details?: Record<string, unknown>,
) {
  await query(
    `insert into audit_logs (user_id, user_name, action, entity_type, entity_id, details) values ($1,$2,$3,$4,$5,$6)`,
    [user?.id ?? null, user?.fullName ?? null, action, entityType ?? null, entityId === undefined ? null : String(entityId), details ? JSON.stringify(details) : null],
    db,
  );
}
