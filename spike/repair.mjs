// Structural repair for one line of model-written JSON. Browser- and Node-safe (no imports).
//
// The models get the content of each component right but miscount the closing
// brackets around it: gpt-oss writes `]` where `}` belongs, Qwen drops a final `}`.
// This walks the line outside of strings and fixes only brackets:
//   - a closer of the wrong kind is replaced by the one the open bracket needs
//   - a closer with nothing open is dropped
//   - closers missing at the end of the line are added
// Text inside strings is never touched, and a line that is still not valid JSON
// afterwards (an unterminated string, say) is reported as broken, not guessed at.

export function repairLine(line) {
  let out = '';
  const open = []; // the closers still owed, innermost last
  let inString = false;
  let escaped = false;
  for (const ch of line) {
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '{') {
      open.push('}');
      out += ch;
    } else if (ch === '[') {
      open.push(']');
      out += ch;
    } else if (ch === '}' || ch === ']') {
      if (open.length) out += open.pop(); // right kind or not, the open bracket decides
      // nothing open: a stray closer, dropped
    } else out += ch;
  }
  return inString ? line : out + open.reverse().join('');
}

/** Parses a line, repairing its brackets if needed. Returns { value, repaired } or null if it cannot be read. */
export function parseLine(line) {
  try {
    return { value: JSON.parse(line), repaired: false };
  } catch {
    try {
      return { value: JSON.parse(repairLine(line)), repaired: true };
    } catch {
      return null;
    }
  }
}
