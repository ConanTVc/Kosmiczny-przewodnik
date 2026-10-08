import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ChapterSchema, GuidesIndexSchema, LocationsFileSchema } from '../src/schema';

/** Zapisuje JSON Schema plików źródłowych – VS Code podpowiada pola i pokazuje błędy przy edycji. */
export function writeJsonSchemas(schemaDir: string): void {
  mkdirSync(schemaDir, { recursive: true });
  const files = {
    'chapter.schema.json': ChapterSchema,
    'locations.schema.json': LocationsFileSchema,
    'guides.schema.json': GuidesIndexSchema,
  };
  for (const [name, schema] of Object.entries(files)) {
    const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
    writeFileSync(join(schemaDir, name), `${JSON.stringify(json, null, 2)}\n`);
  }
}
