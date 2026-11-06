/**
 * NMS index for unobfuscated Minecraft (calendar 26.1+).
 *
 * Mojang stopped publishing server_mappings once the server jar shipped with real names.
 * Instead of falling back to 1.21.11 mappings, read class/field/method names straight from
 * the official server.jar (bundler → META-INF/versions/<id>/server-<id>.jar) and emit them in
 * ProGuard-mapping text form (`name -> name`) so the existing mapping parser/search can reuse it.
 *
 * Dependency-free: minimal ZIP reader (stored/deflate, zip64 aware) + class-file constant pool parser.
 */
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";

// —— ZIP ——

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const SIG_ZIP64_EOCD = 0x06064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export function listZipEntries(buf: Buffer): ZipEntry[] {
  const minEocd = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= minEocd; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP/JAR (no end-of-central-directory)");

  let count = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && buf.readUInt32LE(loc) === SIG_ZIP64_LOCATOR) {
      const z64 = Number(buf.readBigUInt64LE(loc + 8));
      if (buf.readUInt32LE(z64) === SIG_ZIP64_EOCD) {
        count = Number(buf.readBigUInt64LE(z64 + 32));
        cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
      }
    }
  }

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) break;
    const method = buf.readUInt16LE(p + 10);
    let compressedSize = buf.readUInt32LE(p + 20);
    let size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    let localHeaderOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (size === 0xffffffff || compressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      // zip64 extra field (id 0x0001): values present only for fields that overflowed, in order
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const id = buf.readUInt16LE(e);
        const len = buf.readUInt16LE(e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (size === 0xffffffff) {
            size = Number(buf.readBigUInt64LE(q));
            q += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(buf.readBigUInt64LE(q));
            q += 8;
          }
          if (localHeaderOffset === 0xffffffff) {
            localHeaderOffset = Number(buf.readBigUInt64LE(q));
          }
          break;
        }
        e += 4 + len;
      }
    }
    entries.push({ name, method, compressedSize, size, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function readZipEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const off = entry.localHeaderOffset;
  if (buf.readUInt32LE(off) !== SIG_LOCAL) {
    throw new Error(`Bad local header for ${entry.name}`);
  }
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const start = off + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`Unsupported ZIP method ${entry.method} for ${entry.name}`);
}

// —— class files ——

export interface ParsedMember {
  access: number;
  name: string;
  descriptor: string;
}

export interface ParsedClass {
  access: number;
  /** Internal name, e.g. net/minecraft/server/level/ServerPlayer */
  name: string;
  superName?: string;
  interfaces: string[];
  fields: ParsedMember[];
  methods: ParsedMember[];
}

export function parseClassFile(buf: Buffer): ParsedClass {
  if (buf.readUInt32BE(0) !== 0xcafebabe) throw new Error("Not a class file");
  let p = 8;
  const cpCount = buf.readUInt16BE(p);
  p += 2;
  const utf8: Array<string | undefined> = new Array(cpCount);
  const classIdx: Array<number | undefined> = new Array(cpCount);
  for (let i = 1; i < cpCount; i++) {
    const tag = buf[p++];
    switch (tag) {
      case 1: {
        const len = buf.readUInt16BE(p);
        p += 2;
        // Modified UTF-8; identical to UTF-8 for real identifiers.
        utf8[i] = buf.toString("utf8", p, p + len);
        p += len;
        break;
      }
      case 7:
        classIdx[i] = buf.readUInt16BE(p);
        p += 2;
        break;
      case 8:
      case 16:
      case 19:
      case 20:
        p += 2;
        break;
      case 15:
        p += 3;
        break;
      case 3:
      case 4:
      case 9:
      case 10:
      case 11:
      case 12:
      case 17:
      case 18:
        p += 4;
        break;
      case 5:
      case 6:
        p += 8;
        i++; // long/double take two slots
        break;
      default:
        throw new Error(`Unknown constant pool tag ${tag}`);
    }
  }
  const className = (idx: number): string | undefined => {
    const u = classIdx[idx];
    return u ? utf8[u] : undefined;
  };

  const access = buf.readUInt16BE(p);
  const thisClass = buf.readUInt16BE(p + 2);
  const superClass = buf.readUInt16BE(p + 4);
  const ifCount = buf.readUInt16BE(p + 6);
  p += 8;
  const interfaces: string[] = [];
  for (let i = 0; i < ifCount; i++) {
    const n = className(buf.readUInt16BE(p));
    if (n) interfaces.push(n);
    p += 2;
  }

  const readMembers = (): ParsedMember[] => {
    const count = buf.readUInt16BE(p);
    p += 2;
    const out: ParsedMember[] = [];
    for (let i = 0; i < count; i++) {
      const acc = buf.readUInt16BE(p);
      const name = utf8[buf.readUInt16BE(p + 2)] ?? "?";
      const descriptor = utf8[buf.readUInt16BE(p + 4)] ?? "";
      const attrCount = buf.readUInt16BE(p + 6);
      p += 8;
      for (let a = 0; a < attrCount; a++) {
        const len = buf.readUInt32BE(p + 2);
        p += 6 + len;
      }
      out.push({ access: acc, name, descriptor });
    }
    return out;
  };
  const fields = readMembers();
  const methods = readMembers();

  return {
    access,
    name: className(thisClass) ?? "?",
    superName: superClass ? className(superClass) : undefined,
    interfaces,
    fields,
    methods,
  };
}

const PRIMS: Record<string, string> = {
  B: "byte",
  C: "char",
  D: "double",
  F: "float",
  I: "int",
  J: "long",
  S: "short",
  Z: "boolean",
  V: "void",
};

/** Parse one field type starting at i; returns [javaType, nextIndex]. */
function parseType(desc: string, i: number): [string, number] {
  let dims = 0;
  while (desc[i] === "[") {
    dims++;
    i++;
  }
  let base: string;
  if (desc[i] === "L") {
    const end = desc.indexOf(";", i);
    base = desc.slice(i + 1, end).replaceAll("/", ".");
    i = end + 1;
  } else {
    base = PRIMS[desc[i]] ?? desc[i];
    i++;
  }
  return [base + "[]".repeat(dims), i];
}

export function descriptorToJavaType(desc: string): string {
  return parseType(desc, 0)[0];
}

export function methodDescriptorToJava(desc: string): { params: string[]; returns: string } {
  const params: string[] = [];
  let i = 1;
  while (desc[i] !== ")" && i < desc.length) {
    const [t, next] = parseType(desc, i);
    params.push(t);
    i = next;
  }
  const [returns] = parseType(desc, i + 1);
  return { params, returns };
}

const ACC_PUBLIC = 0x0001;
const ACC_PRIVATE = 0x0002;
const ACC_PROTECTED = 0x0004;
const ACC_STATIC = 0x0008;
const ACC_FINAL = 0x0010;
const ACC_BRIDGE = 0x0040;
const ACC_ABSTRACT = 0x0400;
const ACC_SYNTHETIC = 0x1000;

function modifiers(access: number, isMethod: boolean): string {
  const out: string[] = [];
  if (access & ACC_PUBLIC) out.push("public");
  else if (access & ACC_PROTECTED) out.push("protected");
  else if (access & ACC_PRIVATE) out.push("private");
  if (access & ACC_STATIC) out.push("static");
  if (access & ACC_FINAL) out.push("final");
  if (isMethod && access & ACC_ABSTRACT) out.push("abstract");
  return out.length ? out.join(" ") + " " : "";
}

/**
 * Render one class as a ProGuard-style block where obfuscated == real name.
 * Synthetic members, bridges and <clinit> are skipped (noise for plugin authors).
 */
export function classToMappingBlock(cls: ParsedClass): string {
  const fqcn = cls.name.replaceAll("/", ".");
  const lines = [`${fqcn} -> ${fqcn}:`];
  const ext: string[] = [];
  if (cls.superName && cls.superName !== "java/lang/Object") {
    ext.push(`extends ${cls.superName.replaceAll("/", ".")}`);
  }
  if (cls.interfaces.length) {
    ext.push(`implements ${cls.interfaces.map((i) => i.replaceAll("/", ".")).join(",")}`);
  }
  if (ext.length) lines.push(`# ${ext.join(" ")}`);
  for (const f of cls.fields) {
    if (f.access & ACC_SYNTHETIC) continue;
    lines.push(`    ${modifiers(f.access, false)}${descriptorToJavaType(f.descriptor)} ${f.name} -> ${f.name}`);
  }
  for (const m of cls.methods) {
    if (m.access & (ACC_SYNTHETIC | ACC_BRIDGE)) continue;
    if (m.name === "<clinit>") continue;
    const sig = methodDescriptorToJava(m.descriptor);
    lines.push(
      `    ${modifiers(m.access, true)}${sig.returns} ${m.name}(${sig.params.join(",")}) -> ${m.name}`
    );
  }
  return lines.join("\n");
}

/** Bundler jar: META-INF/versions.list → "sha256\tid\tpath" lines; else the jar itself holds classes. */
export function extractServerClassesJar(outer: Buffer): Buffer {
  const entries = listZipEntries(outer);
  const list = entries.find((e) => e.name === "META-INF/versions.list");
  if (!list) return outer;
  const firstLine = readZipEntry(outer, list).toString("utf8").split(/\r?\n/).find(Boolean);
  const rel = firstLine?.split("\t")[2];
  if (!rel) throw new Error("META-INF/versions.list has no jar path");
  const inner = entries.find((e) => e.name === `META-INF/versions/${rel}`);
  if (!inner) throw new Error(`Bundled server jar META-INF/versions/${rel} missing`);
  return readZipEntry(outer, inner);
}

/** Build the ProGuard-style index text for every Mojang class in the server jar. */
export function buildIndexFromServerJar(serverJar: Buffer, mcVersion: string): string {
  const jar = extractServerClassesJar(serverJar);
  const out: string[] = [
    `# mc-sdk NMS index for Minecraft ${mcVersion} — generated from the unobfuscated official server.jar`,
    `# names are real (no obfuscation): left == right. Members: modifiers type name(params).`,
  ];
  let classes = 0;
  for (const entry of listZipEntries(jar)) {
    if (!entry.name.endsWith(".class")) continue;
    if (!entry.name.startsWith("net/minecraft/") && !entry.name.startsWith("com/mojang/")) continue;
    if (entry.name.endsWith("package-info.class") || entry.name.endsWith("module-info.class")) continue;
    try {
      const cls = parseClassFile(readZipEntry(jar, entry));
      if (cls.access & ACC_SYNTHETIC) continue;
      out.push(classToMappingBlock(cls));
      classes++;
    } catch {
      /* skip unreadable class */
    }
  }
  if (!classes) throw new Error(`No Mojang classes found in server.jar for ${mcVersion}`);
  return out.join("\n") + "\n";
}

export function sha1(buf: Buffer): string {
  return createHash("sha1").update(buf).digest("hex");
}
