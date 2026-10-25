// One-off: converts the Gem TD VPK extract into data/baseline. Kept as provenance, not part of the build;
// data/baseline is immutable and is not regenerated.
// Rerun only from a scratch folder with luaparse@0.3.1 installed:
//   node convert-vpk.mjs <.tmp/gemtd-vpk/out> <decompiled map dir> <data/baseline>
// The map dir holds Source2Viewer-CLI 20.1 output for .tmp/gemtd-src/maps/<map>.vpk:
//   <map>/maps/<map>.gnv and <map>/maps/<map>/entities/default_ents.vents.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import luaparse from 'luaparse';

const [VPK, MAPS, OUT] = process.argv.slice(2);
const TMP = path.resolve(VPK, '../..'); // .tmp root, for source labels
const warnings = [];
const sources = [];
const read = (file) => {
  const buf = fs.readFileSync(file);
  sources.push(source(file, buf));
  return buf.toString('utf8').replace(/^﻿/, '');
};
const source = (file, buf) => ({
  file: path.relative(TMP, file).replaceAll('\\', '/'),
  md5: crypto.createHash('md5').update(buf).digest('hex'),
});
const write = (rel, data) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
};

// ---------- Valve KeyValues (KV1). Values stay strings; duplicate keys: last wins (logged).
function parseKV(text, name) {
  let i = 0;
  const n = text.length;
  function token() {
    for (;;) {
      while (i < n && /\s/.test(text[i])) i++;
      if (text.startsWith('//', i)) {
        while (i < n && text[i] !== '\n') i++;
        continue;
      }
      break;
    }
    if (i >= n) return null;
    const c = text[i];
    if (c === '{' || c === '}') return (i++, c);
    if (c === '"') {
      let s = '';
      i++;
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const e = text[++i];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
        } else s += text[i];
        i++;
      }
      i++;
      return { s };
    }
    if (c === '[') throw new Error(`${name}: conditional at ${i}`);
    let s = '';
    while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++];
    return { s };
  }
  function block(pathSoFar) {
    const obj = {};
    for (;;) {
      const k = token();
      if (k === null || k === '}') return obj;
      if (k === '{') throw new Error(`${name}: unexpected { at ${i}`);
      const v = token();
      const val = v === '{' ? block(`${pathSoFar}/${k.s}`) : v.s;
      if (Object.hasOwn(obj, k.s))
        warnings.push(`${name}: duplicate key ${pathSoFar}/${k.s} (last wins)`);
      obj[k.s] = val;
    }
  }
  return block('');
}

// ---------- Lua literals from addon_game_mode.lua
function luaString(raw) {
  const long = /^\[(=*)\[\n?([\s\S]*)\]\1\]$/.exec(raw);
  if (long) return long[2];
  const map = {
    n: '\n',
    t: '\t',
    r: '\r',
    a: '\x07',
    b: '\b',
    f: '\f',
    v: '\v',
    '\\': '\\',
    '"': '"',
    "'": "'",
    '\n': '\n',
  };
  return raw
    .slice(1, -1)
    .replace(/\\(\d{1,3}|x[0-9a-fA-F]{2}|.)/gs, (_, e) =>
      /^\d/.test(e)
        ? String.fromCharCode(+e)
        : e[0] === 'x' && e.length === 3
          ? String.fromCharCode(parseInt(e.slice(1), 16))
          : (map[e] ?? e),
    );
}
console.assert(
  luaString(String.raw`"a\"b\n\65"`) === 'a"b\nA' && luaString('[[x]]') === 'x',
  'luaString',
);
function luaValue(node, src) {
  switch (node.type) {
    case 'NumericLiteral':
      return node.value;
    case 'StringLiteral':
      return luaString(node.raw);
    case 'BooleanLiteral':
      return node.value;
    case 'NilLiteral':
      return undefined;
    case 'UnaryExpression':
      if (node.operator === '-') {
        const v = luaValue(node.argument, src);
        if (typeof v === 'number') return -v;
      }
      break;
    case 'TableConstructorExpression': {
      // Lua semantics: positional fields get 1,2,3..; explicit keys assigned in order.
      const entries = new Map();
      let pos = 1;
      for (const f of node.fields) {
        let key;
        if (f.type === 'TableValue') key = pos++;
        else if (f.type === 'TableKeyString') key = f.key.name;
        else {
          key = luaValue(f.key, src);
          if (typeof key !== 'number' && typeof key !== 'string')
            return { $expr: src.slice(...node.range) };
        }
        const v = luaValue(f.value, src);
        if (entries.has(key))
          warnings.push(`lua: duplicate key [${key}] at line ${f.loc.start.line} (last wins)`);
        if (v === undefined) entries.delete(key);
        else entries.set(key, v);
      }
      const keys = [...entries.keys()];
      // Only purely positional constructors become arrays; author-numbered [n] keys stay object keys
      // so ids like difficulty [1]..[4] keep their numbers.
      if (
        node.fields.every((f) => f.type === 'TableValue') &&
        keys.every((k, idx) => k === idx + 1)
      )
        return keys.map((k) => entries.get(k));
      return Object.fromEntries(keys.map((k) => [String(k), entries.get(k)]));
    }
  }
  return { $expr: src.slice(...node.range) };
}
const isLiteral = (v) => JSON.stringify(v).indexOf('"$expr"') < 0;

function luaTables(file) {
  const src = read(file);
  const ast = luaparse.parse(src, {
    ranges: true,
    locations: true,
    luaVersion: 'LuaJIT',
    encodingMode: 'none',
  });
  const out = {};
  const topLevel = new Set(ast.body);
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === 'AssignmentStatement' || node.type === 'LocalStatement') {
      node.variables.forEach((v, idx) => {
        const init = node.init[idx];
        if (!init) return;
        let name;
        if (v.type === 'MemberExpression' && v.base.type === 'Identifier' && v.base.name === '_G')
          name = v.identifier.name;
        else if (
          v.type === 'Identifier' &&
          node.type === 'AssignmentStatement' &&
          topLevel.has(node)
        )
          name = v.name; // inside functions these are usually locals
        if (!name) return;
        if (
          ![
            'TableConstructorExpression',
            'NumericLiteral',
            'StringLiteral',
            'BooleanLiteral',
            'UnaryExpression',
          ].includes(init.type)
        )
          return;
        const val = luaValue(init, src);
        if (val === undefined || (!isLiteral(val) && init.type !== 'TableConstructorExpression'))
          return;
        if (Object.hasOwn(out, name)) {
          if (JSON.stringify(out[name].value) !== JSON.stringify(val))
            out[name].reassignedAtLines.push(v.loc.start.line);
          return;
        }
        out[name] = { line: v.loc.start.line, value: val, reassignedAtLines: [] };
      });
    }
    for (const k in node) if (k !== 'loc' && k !== 'range') walk(node[k]);
  };
  walk(ast.body);
  return out;
}

// ---------- Map entities (Source2Viewer-decompiled .vents text) and GridNav (.gnv)
function parseEnts(file) {
  const ents = [];
  let cur = null;
  for (const line of read(file).split(/\r?\n/)) {
    if (/^====\d+====$/.test(line)) ents.push((cur = {}));
    else if (cur && line.trim()) {
      const m = /^(\S+)\s+(.*)$/.exec(line);
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      else if (v === 'true' || v === 'false') v = v === 'true';
      else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
      if (Object.hasOwn(cur, m[1]))
        warnings.push(`${path.basename(file)}: duplicate entity key ${m[1]}`);
      cur[m[1]] = v;
    }
  }
  return ents;
}
function parseGnv(file) {
  const b = fs.readFileSync(file);
  sources.push(source(file, b));
  if (b.readUInt32LE(0) !== 0xfadebead) throw new Error('bad gnv magic');
  const [edgeSize, offsetX, offsetY] = [b.readFloatLE(4), b.readFloatLE(8), b.readFloatLE(12)];
  const [width, height, minX, minY] = [
    b.readInt32LE(16),
    b.readInt32LE(20),
    b.readInt32LE(24),
    b.readInt32LE(28),
  ];
  if (b.length !== 32 + width * height)
    throw new Error(`gnv size ${b.length} != ${32 + width * height}`);
  const rows = [];
  for (let y = 0; y < height; y++)
    rows.push(
      [...b.subarray(32 + y * width, 32 + (y + 1) * width)].map((c) => c.toString(16)).join(','),
    );
  return {
    edgeSize,
    offsetX,
    offsetY,
    width,
    height,
    minX,
    minY,
    _note: 'cells[y] is a comma-separated row of raw cell bytes (hex), row 0 = minY',
    cells: rows,
  };
}

// ---------- run
fs.rmSync(OUT, { recursive: true, force: true });
const kv = (rel, out) => write(out, parseKV(read(path.join(VPK, rel)), rel));
kv('scripts/npc/npc_units_custom.txt', 'npc/units.json');
kv('scripts/npc/npc_abilities_custom.txt', 'npc/abilities.json');
kv('scripts/npc/npc_items_custom.txt', 'npc/items.json');
kv('scripts/npc/npc_heroes_custom.txt', 'npc/heroes.json');
kv('scripts/npc/herolist.txt', 'npc/herolist.json');
kv('scripts/npc/activelist.txt', 'npc/activelist.json');
kv('scripts/npc/portraits.txt', 'npc/portraits.json');
for (const m of ['1p', 'coop', 'race'])
  kv(`scripts/shops/gemtd_${m}_shops.txt`, `shops/gemtd_${m}.json`);
kv('scripts/custom_events.txt', 'custom_events.json');
// KV3 text with a single string array; not worth a KV3 parser.
write('custom_net_tables.json', {
  custom_net_tables: [
    ...read(path.join(VPK, 'scripts/custom_net_tables.txt'))
      .split('[')[1]
      .matchAll(/"([^"]*)"/g),
  ].map((m) => m[1]),
});
kv('resource_addon_english.txt', 'localization/english.json');
write(
  'lua/addon_game_mode.json',
  luaTables(path.join(VPK, 'scripts/vscripts/addon_game_mode.lua')),
);
for (const m of ['gemtd_1p', 'gemtd_coop', 'gemtd_race']) {
  const vpk = path.join(TMP, 'gemtd-src', 'maps', `${m}.vpk`);
  sources.push(source(vpk, fs.readFileSync(vpk)));
  write(
    `maps/${m}.entities.json`,
    parseEnts(path.join(MAPS, m, 'maps', m, 'entities', 'default_ents.vents')),
  );
  write(`maps/${m}.gridnav.json`, parseGnv(path.join(MAPS, m, 'maps', `${m}.gnv`)));
}
write('manifest.json', {
  _note:
    'Faithful one-time conversion of the Gem TD custom game. Do not edit; Facet changes go in data/facet/.',
  convertedOn: new Date().toISOString().slice(0, 10),
  notes: [
    'Scripts, localization, and shops come from gemtd-vpk/out (newer game version, addon_game_mode.lua 14.5k lines).',
    'gemtd-vpk has no map files for the main game, so maps come from gemtd-src/maps (older version of the same addon). Entity lumps were decompiled with Source2Viewer-CLI 20.1; .gnv files are read raw.',
    'KeyValues values are kept as strings. Duplicate keys: last wins (listed in warnings).',
    'lua/addon_game_mode.json holds literal _G.* assignments (and literal top-level globals): first literal value, line, and later reassignment lines. Purely positional Lua tables become arrays; author-numbered keys stay object keys. Non-literal parts appear as {"$expr": source}.',
    'Not converted: Lua game logic (rules live in code), gemtd-vpk/out2 (separate gemtd2 addon), particles, models, materials, panorama UI.',
  ],
  sources,
  warnings,
});
console.log(sources.length, 'sources,', warnings.length, 'warnings');

// Lock file: sha256 of every baseline file; tests fail if any byte changes.
const lock = {};
const walkDir = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walkDir(f);
    else
      lock[path.relative(OUT, f).split(path.sep).join('/')] = crypto
        .createHash('sha256')
        .update(fs.readFileSync(f))
        .digest('hex');
  });
walkDir(OUT);
fs.writeFileSync(
  path.join(path.dirname(OUT), 'baseline.lock.json'),
  JSON.stringify(Object.fromEntries(Object.entries(lock).sort()), null, 1) + '\n',
);
