import { randomUUID } from "node:crypto";
import type { AccountSql } from "../auth/account-admin.js";
import {
  fold, serviceKinds, TravelWriteError,
  type DestinationSummary, type PublicServiceQuery, type ServiceKind, type TravelInput, type TravelKind, type TravelRecord,
} from "./contracts.js";
import { demoDestinations, demoServices } from "./demo-data.js";

type Column = "text" | "numeric" | "coord" | "int" | "boolean" | "uuid" | "tags" | "CostUnit" | "DataSource" | "TransportMode";
const common = { slug: "text", name: "text", description: "text", source: "DataSource", sourceUrl: "text", isActive: "boolean" } as const;
const place = { destinationId: "uuid", address: "text", latitude: "coord", longitude: "coord", priceVnd: "numeric", costUnit: "CostUnit", tags: "tags" } as const;
// Table and column names are constants; every value is passed as a bind parameter.
const columns: Record<TravelKind, Record<string, Column>> = {
  destinations: { ...common, province: "text", latitude: "coord", longitude: "coord", tags: "tags" },
  hotels: { ...common, ...place, roomCapacity: "int" },
  restaurants: { ...common, ...place, foodOptions: "tags" },
  attractions: { ...common, ...place, durationMinutes: "int", isIndoor: "boolean" },
  transportations: { ...common, destinationId: "uuid", departure: "text", mode: "TransportMode", priceVnd: "numeric", costUnit: "CostUnit", capacity: "int", durationMinutes: "int" },
};
const tables: Record<TravelKind, string> = { destinations: "Destination", hotels: "Hotel", restaurants: "Restaurant", attractions: "Attraction", transportations: "Transportation" };

function selectList(kind: TravelKind) {
  const fields = Object.entries(columns[kind]).map(([name, type]) => {
    const column = `t."${name}"`;
    if (type === "numeric") return `${column}::text AS "${name}"`;
    if (type === "coord") return `${column}::float8 AS "${name}"`;
    if (type === "tags") return `COALESCE(${column}, ARRAY[]::text[]) AS "${name}"`;
    if (type === "CostUnit" || type === "DataSource" || type === "TransportMode") return `${column}::text AS "${name}"`;
    return `${column} AS "${name}"`;
  });
  fields.push("t.id", "t.revision", 't."updatedAt"');
  if (kind !== "destinations") fields.push('d.name AS "destinationName"', 'd.slug AS "destinationSlug"', 'd."isActive" AS "destinationActive"');
  return fields.join(",");
}
function fromClause(kind: TravelKind) {
  return kind === "destinations" ? `"${tables[kind]}" t` : `"${tables[kind]}" t JOIN "Destination" d ON d.id=t."destinationId"`;
}
function parameter(type: Column, index: number) {
  if (type === "tags") return `ARRAY(SELECT json_array_elements_text($${index}::json))`;
  if (type === "text") return `$${index}`;
  if (type === "coord") return `$${index}::numeric`;
  if (type === "CostUnit" || type === "DataSource" || type === "TransportMode") return `$${index}::"${type}"`;
  return `$${index}::${type}`;
}
function value(type: Column, input: unknown) {
  if (type === "tags") return JSON.stringify(input ?? []);
  if (type === "coord") return input === null || input === undefined ? null : String(input);
  return input ?? null;
}
type Row = TravelRecord & { updatedAt: string | Date; destinationActive?: boolean };
const serialize = ({ destinationActive: _active, ...row }: Row): TravelRecord => ({ ...row, updatedAt: new Date(row.updatedAt).toISOString() });
const byPrice = (a: TravelRecord, b: TravelRecord) => {
  const difference = BigInt(a.priceVnd ?? "0") - BigInt(b.priceVnd ?? "0");
  return difference < 0n ? -1 : difference > 0n ? 1 : a.name.localeCompare(b.name, "vi");
};
function haystack(row: TravelRecord) {
  return fold([row.name, row.description, row.address, row.province, row.departure, row.destinationName, ...(row.tags ?? []), ...((row.foodOptions as string[] | undefined) ?? [])].filter(Boolean).join(" "));
}
function uniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  const meta = "meta" in error && error.meta && typeof error.meta === "object" && "code" in error.meta ? error.meta.code : undefined;
  return code === "23505" || meta === "23505" || (error instanceof Error && /23505|unique constraint/i.test(error.message));
}

export function createTravelRepository(db: AccountSql) {
  async function rows(kind: TravelKind, where = "", values: unknown[] = []) {
    const result = await db.query<{ items: Row[] }>(`SELECT COALESCE((SELECT json_agg(v) FROM (SELECT ${selectList(kind)} FROM ${fromClause(kind)} ${where}) v),'[]'::json) AS items`, values);
    return result.rows[0].items.map(serialize);
  }
  async function byId(kind: TravelKind, id: string) {
    return (await rows(kind, "WHERE t.id=$1::uuid", [id]))[0] ?? null;
  }
  async function write(kind: TravelKind, input: Record<string, unknown>, id?: string, revision?: number, ignoreConflict = false) {
    const entries = Object.entries(columns[kind]);
    const values = entries.map(([name, type]) => value(type, input[name]));
    if (!id) {
      const newId = randomUUID();
      const sql = `INSERT INTO "${tables[kind]}" (id,${entries.map(([name]) => `"${name}"`).join(",")},"updatedAt")
        VALUES ($1::uuid,${entries.map(([, type], index) => parameter(type, index + 2)).join(",")},now())
        ${ignoreConflict ? "ON CONFLICT (slug) DO NOTHING" : ""} RETURNING id`;
      return (await db.query<{ id: string }>(sql, [newId, ...values])).rows[0]?.id ?? null;
    }
    const sql = `UPDATE "${tables[kind]}" SET ${entries.map(([name, type], index) => `"${name}"=${parameter(type, index + 3)}`).join(",")},revision=revision+1,"updatedAt"=now()
      WHERE id=$1::uuid AND revision=$2::int RETURNING id`;
    return (await db.query<{ id: string }>(sql, [id, revision, ...values])).rows[0]?.id ?? null;
  }
  async function activeServices(kind: ServiceKind) {
    return (await rows(kind, 'WHERE t."isActive" AND d."isActive"')).sort(byPrice);
  }

  return {
    async travelAdminList(kind: TravelKind, query: { q: string; destinationId?: string; status: "all" | "active" | "inactive"; page: number }) {
      const all = await rows(kind);
      const q = fold(query.q);
      const matching = all.filter((row) => (query.status === "all" || row.isActive === (query.status === "active"))
        && (!query.destinationId || row.destinationId === query.destinationId)
        && (!q || haystack(row).includes(q) || row.slug.includes(q)))
        .sort((a, b) => (a.destinationName ?? "").localeCompare(b.destinationName ?? "", "vi") || a.name.localeCompare(b.name, "vi"));
      const limit = 20;
      const destinations = kind === "destinations" ? all : await rows("destinations");
      return {
        data: matching.slice((query.page - 1) * limit, query.page * limit),
        pagination: { page: query.page, limit, total: matching.length, totalPages: Math.ceil(matching.length / limit) },
        destinations: destinations.map((d) => ({ id: d.id, name: d.name, isActive: d.isActive })).sort((a, b) => a.name.localeCompare(b.name, "vi")),
      };
    },
    async travelSave<K extends TravelKind>(kind: K, input: TravelInput<K>, id?: string, revision?: number): Promise<TravelRecord> {
      const data = input as Record<string, unknown>;
      if (typeof data.destinationId === "string"
        && !(await db.query('SELECT id FROM "Destination" WHERE id=$1::uuid', [data.destinationId])).rows.length) throw new TravelWriteError(400, "invalid_destination");
      if (id && !(await db.query(`SELECT id FROM "${tables[kind]}" WHERE id=$1::uuid`, [id])).rows.length) throw new TravelWriteError(404, "not_found");
      if ((await db.query(`SELECT id FROM "${tables[kind]}" WHERE slug=$1 AND ($2::uuid IS NULL OR id<>$2::uuid)`, [data.slug, id ?? null])).rows.length) throw new TravelWriteError(409, "duplicate_slug");
      let savedId: string | null;
      try { savedId = await write(kind, data, id, revision); }
      catch (error) { if (uniqueViolation(error)) throw new TravelWriteError(409, "duplicate_slug"); throw error; }
      if (!savedId) {
        if (id && (await byId(kind, id))) throw new TravelWriteError(409, "stale_revision");
        throw new TravelWriteError(404, "not_found");
      }
      return (await byId(kind, savedId))!;
    },
    async travelDestinations(): Promise<DestinationSummary[]> {
      const counts = Object.fromEntries(serviceKinds.map((kind) => [kind, `(SELECT count(*)::int FROM "${tables[kind]}" s WHERE s."destinationId"=t.id AND s."isActive")`]));
      const result = await db.query<{ items: (Row & { counts: Record<ServiceKind, number> })[] }>(`SELECT COALESCE((SELECT json_agg(v ORDER BY v.name) FROM (
        SELECT ${selectList("destinations")}, json_build_object(${serviceKinds.map((kind) => `'${kind}',${counts[kind]}`).join(",")}) AS counts
        FROM "Destination" t WHERE t."isActive") v),'[]'::json) AS items`, []);
      return result.rows[0].items.map((row) => ({ ...serialize(row), counts: row.counts }));
    },
    async travelDestination(slug: string) {
      const destination = (await rows("destinations", 'WHERE t.slug=$1 AND t."isActive"', [slug]))[0];
      if (!destination) return null;
      const services = await Promise.all(serviceKinds.map(async (kind) => [kind, (await activeServices(kind)).filter((row) => row.destinationId === destination.id)] as const));
      return { destination, ...Object.fromEntries(services) as Record<ServiceKind, TravelRecord[]> };
    },
    async travelServices(kind: ServiceKind, query: PublicServiceQuery) {
      const all = await activeServices(kind);
      const q = fold(query.q), tag = fold(query.tag);
      const matching = all.filter((row) => (!query.destination || row.destinationSlug === query.destination)
        && (!q || haystack(row).includes(q))
        && (!tag || [...(row.tags ?? []), ...((row.foodOptions as string[] | undefined) ?? [])].some((item) => fold(item) === tag))
        && (query.maxPrice === undefined || BigInt(row.priceVnd ?? "0") <= BigInt(query.maxPrice)));
      if (query.sort === "name") matching.sort((a, b) => a.name.localeCompare(b.name, "vi"));
      const tags = [...new Set(all.filter((row) => !query.destination || row.destinationSlug === query.destination).flatMap((row) => row.tags ?? []))].sort((a, b) => a.localeCompare(b, "vi")).slice(0, 24);
      return {
        data: matching.slice((query.page - 1) * query.limit, query.page * query.limit),
        pagination: { page: query.page, limit: query.limit, total: matching.length, totalPages: Math.ceil(matching.length / query.limit) },
        facets: { tags },
      };
    },
    // Idempotent: existing slugs (including admin-edited rows) are never overwritten.
    async seedTravelDemo(options: { onlyIfEmpty?: boolean } = {}) {
      if (options.onlyIfEmpty && (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM "Destination"', [])).rows[0].count > 0) return 0;
      let inserted = 0;
      for (const destination of demoDestinations) if (await write("destinations", { ...destination, source: "DEMO", isActive: true, sourceUrl: null }, undefined, undefined, true)) inserted++;
      const ids = new Map((await rows("destinations")).map((row) => [row.slug, row.id]));
      for (const [kind, items] of Object.entries(demoServices) as [ServiceKind, (Record<string, unknown> & { destination: string })[]][]) {
        for (const { destination, ...item } of items) {
          const destinationId = ids.get(destination);
          if (destinationId && await write(kind, { ...item, destinationId, source: "DEMO", isActive: true, sourceUrl: null }, undefined, undefined, true)) inserted++;
        }
      }
      return inserted;
    },
  };
}
export type TravelRepository = ReturnType<typeof createTravelRepository>;
