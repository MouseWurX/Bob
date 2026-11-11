// Counts words, lines and characters. A pack tool is one plain JavaScript file that exports run(input).
export async function run(input) {
  const text = String(input.text ?? '');
  const words = text.split(/\s+/).filter(Boolean).length;
  const lines = text ? text.split(/\r?\n/).length : 0;
  return { words, lines, characters: text.length };
}
