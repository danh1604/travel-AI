import type { AccountDatabase } from "../auth/account-admin.js";
import type { KnowledgeDoc } from "./retrieve.js";
export type IndexedDoc = KnowledgeDoc & { embedding: number[] };
export interface KnowledgeRepository {
  syncKnowledge(fingerprint: string, docs: IndexedDoc[]): Promise<void>;
  searchKnowledge(fingerprint: string, vector: number[], limit: number): Promise<{ id: string; similarity: number }[]>;
}
export function createKnowledgeRepository(db: AccountDatabase): KnowledgeRepository {
  return {
    async syncKnowledge(fingerprint, docs) {
      await db.transaction(async (tx) => {
        // All backend processes serialize updates to the shared public index.
        await tx.query("SELECT pg_advisory_xact_lock(724620181) IS NULL AS locked", []);
        const old = (await tx.query<{ fingerprint: string }>('SELECT fingerprint FROM "KnowledgeChunk" LIMIT 1', [])).rows[0];
        if (old?.fingerprint === fingerprint) return;
        await tx.query('DELETE FROM "KnowledgeChunk" RETURNING id', []);
        await tx.query(`INSERT INTO "KnowledgeChunk" (id,title,body,url,kind,destinations,fingerprint,embedding)
          SELECT x.id,x.title,x.body,x.url,x.kind,x.destinations,$2,x.embedding::vector
          FROM jsonb_to_recordset($1::jsonb) AS x(id text,title text,body text,url text,kind text,destinations jsonb,embedding text) RETURNING id`, [JSON.stringify(docs.map((d) => ({ ...d, embedding: JSON.stringify(d.embedding) }))), fingerprint]);
      });
    },
    async searchKnowledge(fingerprint, vector, limit) {
      return (await db.query<{ id: string; similarity: number }>('SELECT id,1-(embedding <=> $1::vector) AS similarity FROM "KnowledgeChunk" WHERE fingerprint=$2 ORDER BY embedding <=> $1::vector,id LIMIT $3', [JSON.stringify(vector), fingerprint, limit])).rows;
    },
  };
}
