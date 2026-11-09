// Lab 2c, the lesson builder: the three kinds of lesson a set can be built from (the design's 4.2 table). On its own
// so src/lab.js can list them for the page without importing the builder (which imports the writer, which builds a
// throwaway Bob: a cycle that would stall the builder process).
export const KINDS = [
  { id: 'material', label: 'Working with my material', hint: 'Questions a person would really ask about a passage, answered with the passage in front of Bob. Habits for your kind of work, not the facts by heart.', needs: 'passages' },
  { id: 'voice', label: 'Writing in my voice', hint: 'Your own writing as the answer, with the request that would have produced it. For emails, posts and stories you wrote.', needs: 'passages' },
  { id: 'chats', label: 'My past conversations', hint: 'Each exchange in a chat log becomes a lesson. Another assistant\'s answers are re-said in Bob\'s voice.', needs: 'exchanges' }
];
export const KIND_IDS = KINDS.map((k) => k.id);
export const SAMPLE_COUNT = 12;
