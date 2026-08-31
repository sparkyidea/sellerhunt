import { pgGenerate } from "drizzle-dbml-generator";
// biome-ignore lint/performance/noNamespaceImport: needed for drizzle schema
import * as schema from "../schema";

const out = "./src/visual/schema.dbml";
const relational = false; // Use foreign key constraints instead of relations

pgGenerate({ schema, out, relational });

console.log("✅ Created the schema.dbml file");
