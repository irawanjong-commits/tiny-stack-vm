// tiny-stack-vm: a faithful interpreter for make.fun's tiny stack ISA (kit: generator/subject/ISA.md),
// matching the reference VM's answers exactly — every trap code, both limits, wrapping 32-bit arithmetic,
// unsigned DIVU/MODU/LTU, masked shifts, PUSH8 sign extension. /input/<id> -> /output/<id>, one run per set.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// By opcode byte: immediate length (-1: not an opcode), pops, pushes.
const IM = new Int8Array(256).fill(-1);
const PO = new Int8Array(256);
const PU = new Int8Array(256);
// Binary ops 0x10-0x22 (not 0x17/0x1b/0x1f) share: no immediate, pop 2, push 1.
for (let o = 0x10; o <= 0x22; o++) if (o !== 0x17 && o !== 0x1b && o !== 0x1f) { IM[o] = 0; PO[o] = 2; PU[o] = 1; }
for (const [o, i, p, u] of [
  [0x00, 0, 0, 0], [0x01, 1, 0, 1], [0x02, 4, 0, 1], [0x03, 0, 1, 0], [0x04, 0, 1, 2],
  [0x05, 0, 2, 2], [0x06, 0, 2, 3], [0x07, 0, 3, 3], [0x17, 0, 1, 1], [0x1b, 0, 1, 1],
  [0x30, 2, 0, 0], [0x31, 2, 1, 0], [0x32, 2, 1, 0], [0x33, 2, 0, 0], [0x34, 0, 0, 0],
  [0x40, 0, 1, 1], [0x41, 0, 2, 0], [0x50, 0, 1, 0], [0x51, 0, 1, 0], [0x52, 0, 0, 1],
  [0x53, 0, 1, 0],
]) { IM[o] = i; PO[o] = p; PU[o] = u; }

const enc = new TextEncoder();

function run(p: Uint8Array, inp: Uint8Array): { out: Uint8Array; code: number } {
  const n = p.length;
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, csp = 0, olen = 0, ip = 0, pc = 0, steps = 0;
  const fin = (code: number) => ({ out: out.subarray(0, olen), code });
  for (;;) {
    // Step order per ISA.md.
    if (steps === 1000000) return fin(10);
    if (pc < 0 || pc >= n) return fin(9);
    const op = p[pc];
    const im = IM[op];
    if (im < 0) return fin(5);
    if (pc + im >= n) return fin(9);
    steps++;
    if (sp < PO[op]) return fin(2);
    if (sp - PO[op] + PU[op] > 256) return fin(3);
    const nx = pc + 1 + im;
    pc = nx;
    switch (op) {
      case 0x00: return fin(0);
      case 0x01: D[sp++] = (p[nx - 1] << 24) >> 24; break; // PUSH8, sign-extended
      case 0x02: D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x30: case 0x31: case 0x32: { // JMP/JZ/JNZ: pc = next + offset; target checked next step
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 0x30) { const v = D[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 0x33: // CALL: absolute target; 64 return addresses held traps 7
        if (csp === 64) return fin(7);
        C[csp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 0x34: if (csp === 0) return fin(8); pc = C[--csp]; break;
      case 0x40: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) return fin(6);
        D[sp - 1] = M[a];
        break;
      }
      case 0x41: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) return fin(6);
        M[a] = D[sp - 2];
        sp -= 2;
        break;
      }
      case 0x50: { // PRINT: past 65,536 output bytes it writes nothing, traps 11
        const bs = enc.encode(String(D[sp - 1]));
        if (olen + bs.length > 65536) return fin(11);
        sp--;
        out.set(bs, olen);
        olen += bs.length;
        break;
      }
      case 0x51:
        if (olen + 1 > 65536) return fin(11);
        out[olen++] = D[--sp] & 255;
        break;
      case 0x52: D[sp++] = ip < inp.length ? inp[ip++] : -1; break; // IN: -1 at end of input
      case 0x53: return fin(D[--sp] & 255); // EXIT: low byte
      default: { // binary operators 0x10-0x16, 0x18-0x1a, 0x1c-0x1e, 0x20-0x22
        const b = D[sp - 1];
        const a = D[sp - 2];
        let r: number;
        switch (op) {
          case 0x10: r = (a + b) | 0; break;
          case 0x11: r = (a - b) | 0; break;
          case 0x12: r = Math.imul(a, b); break; // MUL
          case 0x13: if (b === 0) return fin(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; break;
          case 0x14: if (b === 0) return fin(4); r = b === -1 ? 0 : a % b | 0; break; // MOD
          case 0x15: if (b === 0) return fin(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
          case 0x16: if (b === 0) return fin(4); r = (a >>> 0) % (b >>> 0) | 0; break;
          case 0x18: r = a & b; break;
          case 0x19: r = a | b; break;
          case 0x1a: r = a ^ b; break;
          case 0x1c: r = a << (b & 31); break; // counts masked to 5 bits
          case 0x1d: r = a >> (b & 31); break;
          case 0x1e: r = (a >>> (b & 31)) | 0; break;
          case 0x20: r = a === b ? 1 : 0; break;
          case 0x21: r = a < b ? 1 : 0; break;
          case 0x22: r = a >>> 0 < b >>> 0 ? 1 : 0; break; // LTU
        }
        sp -= 2;
        D[sp++] = r;
        break;
      }
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))),
    new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
