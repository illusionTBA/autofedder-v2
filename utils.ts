import { Database } from "jsr:@db/sqlite";

class DatabaseWrapper {
  db: Database;
  constructor() {
    this.db = new Database(Deno.env.get("DB_FILE_NAME") || "data.db");
    this.db.prepare(`
            CREATE TABLE IF NOT EXISTS messages (
              id TEXT PRIMARY KEY,
              webhook_id TEXT
            )
          `).run();
  }
  save(id: string, webhookId: string) {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO messages (id, webhook_id) VALUES (?, ?)`,
    );
    stmt.run(id, webhookId);
  }

  get(id: string): string | undefined {
    const stmt = this.db.prepare(
      `SELECT webhook_id FROM messages WHERE id = ?`,
    );
    const row = stmt.get(id) as Record<string, string>;

    return row ? row.webhook_id : undefined;
  }

  getHookId(id: string): string | undefined {
    const stmt = this.db.prepare(
      `SELECT id FROM messages WHERE webhook_id = ?`,
    );

    const row = stmt.get(id) as Record<string, string>;

    return row ? row.id : undefined;
  }

  delete(id: string) {
    const stmt = this.db.prepare(`DELETE FROM messages WHERE id = ?`);
    stmt.run(id);
  }
}

function cleanMessage(message: string): string {
  return message
    .replaceAll("@everyone", "@\u200Beveryone")
    .replaceAll("@here", "@\u200Bhere");
}
export { cleanMessage, DatabaseWrapper };
