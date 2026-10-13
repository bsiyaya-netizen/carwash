import { readFile } from 'node:fs/promises';
import { pool } from './db.js';

const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Schema applied');
await pool.end();
