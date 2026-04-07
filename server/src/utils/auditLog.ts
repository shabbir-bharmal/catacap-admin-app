import pool from "../db.js";

export type AuditActionType = "Created" | "Modified" | "Deleted";

interface LogAuditParams {
  tableName: string;
  recordId: string;
  actionType: AuditActionType;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
  updatedBy?: string | null;
}

export async function logAudit({
  tableName,
  recordId,
  actionType,
  oldValues = null,
  newValues = null,
  updatedBy = null,
}: LogAuditParams): Promise<void> {
  try {
    let changedColumns: string[] = [];

    if (actionType === "Modified" && oldValues && newValues) {
      const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
      for (const key of allKeys) {
        const oldVal = oldValues[key] ?? null;
        const newVal = newValues[key] ?? null;
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changedColumns.push(key);
        }
      }
    } else if (actionType === "Created" && newValues) {
      changedColumns = Object.keys(newValues);
    } else if (actionType === "Deleted" && oldValues) {
      changedColumns = Object.keys(oldValues);
    }

    await pool.query(
      `INSERT INTO audit_logs (table_name, record_id, action_type, old_values, new_values, changed_columns, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        tableName,
        recordId,
        actionType,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        JSON.stringify(changedColumns),
        updatedBy,
      ]
    );
  } catch (err) {
    console.error("Audit log error:", err);
  }
}
