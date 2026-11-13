// The quick quiz's facts and code questions, shared by experts-test (asks them) and make-datasets (sorts kept answers into right and wrong).
import vm from 'node:vm';

export const FACTS = [
  ['What is the capital of Australia? One word.', /canberra/i], ['How many minutes are in 3.5 hours? Just the number.', /\b210\b/],
  ['What is 17 times 23? Just the number.', /\b391\b/], ['Which planet is known as the Red Planet? One word.', /mars/i],
  ['What gas do plants take in for photosynthesis? Short answer.', /carbon dioxide|co2/i], ['How many sides does a hexagon have? Just the number.', /\b6\b|six/i],
  ['Convert 100 degrees Celsius to Fahrenheit. Just the number.', /\b212\b/], ['Who wrote "Pride and Prejudice"? Name only.', /austen/i],
  ['What is the square root of 144? Just the number.', /\b12\b/], ['In what year did the first person walk on the Moon? Just the year.', /1969/],
  ['What is the chemical symbol for gold?', /\bAu\b/], ['If a train leaves at 14:40 and the trip takes 95 minutes, when does it arrive? HH:MM only.', /16:15/],
  ['What is the largest ocean on Earth? One or two words.', /pacific/i], ['How many bytes are in a kilobyte in the binary sense (KiB)? Just the number.', /1024/],
  ['What is the freezing point of water in Kelvin? Just the number, two decimals.', /273\.15/], ['Name the programming language whose package manager is called cargo.', /rust/i],
  ['What is 2 to the power of 10? Just the number.', /\b1024\b/], ['Which is bigger, 0.7 or 0.65? Just the number.', /\b0\.7\b/],
  ['A shirt costs $40 and is 25% off. What is the new price? Just the number.', /\b30\b/], ['What continent is Egypt in? One word.', /africa/i]
];
export const CODE = [
  ['Write a JavaScript function named isPalindrome(s) that ignores case and non-letters. Reply with only the code.', 'isPalindrome', (f) => f('A man, a plan, a canal: Panama') === true && f('Bob') === true && f('hello') === false],
  ['Write a JavaScript function named fizz(n) that returns an array of strings for 1..n with FizzBuzz rules. Only the code.', 'fizz', (f) => JSON.stringify(f(15).slice(-3)) === '["13","14","FizzBuzz"]' && f(5)[2] === 'Fizz' && f(5)[4] === 'Buzz'],
  ['Write a JavaScript function named sumDigits(n) that returns the sum of the digits of a non-negative integer. Only the code.', 'sumDigits', (f) => f(12345) === 15 && f(0) === 0],
  ['Write a JavaScript function named uniqueSorted(a) returning the unique numbers of array a sorted ascending. Only the code.', 'uniqueSorted', (f) => JSON.stringify(f([3, 1, 3, 2, 1])) === '[1,2,3]'],
  ['Write a JavaScript function named camel(s) turning "hello world foo" into "helloWorldFoo". Only the code.', 'camel', (f) => f('hello world foo') === 'helloWorldFoo' && f('bob') === 'bob'],
  ['Write a JavaScript function named countVowels(s) returning how many of a, e, i, o, u (any case) are in s. Only the code.', 'countVowels', (f) => f('Patches the CAT') === 4 && f('xyz') === 0]
];
export const CANT = /\b(i can(?:'|\u2019)?t|i cannot|i'm (?:not able|unable)|i am (?:not able|unable)|i don(?:'|\u2019)?t have (?:access|the ability)|not able to)\b/i;

export function runCode(text, name, test) {
  const code = (text.match(/```(?:js|javascript)?\s*([\s\S]*?)```/i)?.[1] || text).trim();
  try { const box = {}; vm.createContext(box); vm.runInContext(`${code}\n;globalThis.__f = ${name};`, box, { timeout: 2000 }); return Boolean(test(box.__f)); } catch { return false; }
}
