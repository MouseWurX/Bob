// The code map: what a file is for, the names in it, the map of a folder, and the lines around an error.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './check.js';
import { MAP_SKIP, CODE_EXT, purposeOf, namesIn, patchInfo, codeMap, linesAround } from '../src/code-map.js';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

check('the purpose is the first comment line', purposeOf('// Adds two numbers.\nexport const add = (a, b) => a + b;') === 'Adds two numbers.');
check('a licence line is not a purpose', purposeOf('// Copyright someone\n// Reads the settings file.\n') === 'Reads the settings file.');
check('a Python comment works too', purposeOf('#!/usr/bin/env python\n# Sorts the photos.\n') === 'Sorts the photos.');
check('exported and top-level names are found, once each', namesIn('export function a() {}\nexport const b = 1;\nfunction c() {}\nclass D {}\nexport function a() {}').join(',') === 'a,b,c,D');
check('node_modules and .git are skipped', MAP_SKIP.has('node_modules') && MAP_SKIP.has('.git'));
check('JavaScript, Python and patch files are code; text files are not', CODE_EXT.test('a.mjs') && CODE_EXT.test('b.py') && CODE_EXT.test('c.patch') && !CODE_EXT.test('notes.txt'));
const map = codeMap(src);
check('the map of this project lists each file with its length', /^7 source files, \d+ lines, in /.test(map) && /git-look\.js \(\d+\)/.test(map) && /sort-names\.js \(\d+\)/.test(map));
check('the map names the main functions of a file', /token-count\.js \(\d+\).*\[.*learnPer/.test(map));
check('an empty folder says so', /^No source files in /.test(codeMap(path.join(src, 'nothing-here'))));
const around = linesAround('a\nb\nc\nd\ne', 3, 1);
check('lines around an error are numbered and the line is marked', around.split('\n').slice(1).join('\n') === '2| b\n3> c\n4| d');
check('the first line says which lines are shown', /^\(Lines 2 to 4 of 5; line 3 is marked >\./.test(around));
check('a line past the end shows the last lines', linesAround('a\nb', 99, 1).endsWith('1| a\n2> b'));
const p = patchInfo('Subject: [PATCH] add a counter\n---\ndiff --git a/src/x.c b/src/x.c\n--- a/src/x.c\n+++ b/src/x.c\n+int count_things(void) {\n+  return 1;\n-old line\n');
check('a patch is mapped by the files it changes and its lines', p.files.join(',') === 'src/x.c' && p.plus === 2 && p.minus === 1 && p.what === 'add a counter');
