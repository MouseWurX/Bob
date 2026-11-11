// Reads one file it was given (the sandbox lets it read only that file) and counts it.
import fs from 'node:fs';

export async function run(input) {
  const text = fs.readFileSync(String(input.file), 'utf8').replace(/\r\n/g, '\n');
  const words = text.split(/\s+/).filter(Boolean).length;
  return { file: input.file, words, lines: text ? text.split('\n').length : 0, characters: text.length };
}
