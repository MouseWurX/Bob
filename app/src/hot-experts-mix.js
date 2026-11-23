// The fixed, labelled mix that hot-expert profiles are counted on (src/hot-experts.js). The same for everyone, and
// published here so anyone can see what "coding" or "office" held, and check a profile's mix fingerprint. Nobody's
// chats go into it. Calibration text only: it is read by the brain to count which experts it picks, never used
// to teach a brain anything. Changing a word changes the fingerprint, so old profiles show as made from another mix.
export const HOT_MIX = {
  coding: [
    'Write a Python function that reads a CSV file of orders (date, customer, amount) and returns the total per customer, sorted from largest to smallest. Include type hints and a short docstring.',
    'This JavaScript throws "Cannot read properties of undefined (reading \'map\')" on the first render:\n\nfunction List({ items }) {\n  return <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>;\n}\n\nExplain why and fix it.',
    'Refactor this C# method so it does one thing per method, and add a unit test for the price rule:\n\npublic decimal Checkout(Cart c) { decimal t = 0; foreach (var i in c.Items) { t += i.Price * i.Qty; } if (t > 100) t *= 0.9m; Log("total " + t); return t; }',
    'Write a Blender Python script that adds a 10 by 10 grid of cubes, each scaled in height by a sine wave across the grid, and gives every cube its own material colour.',
    'Read this error from a build and say what to change:\n\nerror TS2345: Argument of type \'string | undefined\' is not assignable to parameter of type \'string\'.\n  src/config.ts:42:18 - loadFile(process.env.CONFIG_PATH)'
  ],
  office: [
    'Draft a short, friendly email to a supplier asking them to move Thursday\'s delivery to Friday morning, and to confirm the new time by tomorrow.',
    'Turn these notes into a tidy meeting summary with decisions and action items:\n- budget ok for Q1, marketing +5%\n- Sam to send venue quotes by the 20th\n- launch date moves to March 3\n- need a new designer, Priya to post the job',
    'Make a table of these expenses by category and give the total for each: coffee 4.50, train 23.00, lunch 14.20, hotel 129.00, taxi 18.40, coffee 3.90, dinner 41.00.',
    'Rewrite this paragraph so it is clear and polite, for a customer whose order arrived late: "Your order was delayed due to issues. We are sorry. It will be fine next time."',
    'Plan a one-week schedule for preparing a quarterly report: gathering numbers, writing, review, and sending, with about two hours a day.'
  ],
  research: [
    'Compare heat pumps and gas furnaces for a cold climate: running cost, upfront cost, lifespan and how they perform below -20 degrees. Say what you would need to look up to be sure.',
    'Summarise what is known about how sleep affects memory, in plain words, and list three questions that are still open.',
    'I want to choose between three open-source note apps. What should I compare, and how would I test each in an afternoon?',
    'Explain how a bill becomes law in a parliamentary system, step by step, and where it can be stopped.',
    'What are the main ways a battery loses capacity over time, and what can an owner do to slow it down?'
  ],
  chat: [
    'Hi! I just got back from a long walk and I am thinking about what to cook tonight. Something warm, not too much work.',
    'Can you tell me a short story about a robot who learns to garden?',
    'I have been feeling a bit stuck with learning guitar. Any tips to make practice more fun?',
    'What is a good board game for four people who have never played anything more complicated than cards?',
    'Help me think of a name for my new cat. She is grey, very curious and likes to sit on keyboards.'
  ]
};
