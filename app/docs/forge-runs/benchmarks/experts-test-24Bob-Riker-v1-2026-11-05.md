# Experts-per-word test, 2026-11-05T10-38-33

Model: Healed 24Bob (41 layers, 176 experts, 8 per word by default). Thinking off. Tool quiz: Bob's real prompt and all his tools, 97 plain requests from test/phrasings.js.

| Experts per word | Right tool | Facts | Code runs | Writing speed |
|---|---|---|---|---|
| 8 | 53/97 (55%) | 20/20 (100%) | 4/6 (67%) | 144.5 tok/s |

## Misses
### 8 per word
- [picture] "design a poster for my band" -> no tool
- [picture] "can I get a banner for my twitch" -> no tool
- [music] "I need some background music for my game" -> no tool
- [files] "clean up my downloads" -> list_folder
- [files] "put all the pdfs in one folder" -> list_folder
- [files] "rename these photos by date" -> list_folder
- [files] "zip up my project" -> no tool
- [files] "unpack that archive" -> list_folder
- [files] "move my screenshots to pictures" -> list_folder
- [files] "my desktop is a mess, sort it out" -> list_folder
- [run] "run the tests" -> list_folder
- [run] "install the dependencies" -> list_folder
- [run] "build my project" -> list_folder
- [run] "start the server" -> no tool
- [run] "fire up the dev server" -> list_folder
- [schedules] "do this every friday" -> no tool
- [schedules] "each night back up my notes" -> list_folder
- [schedules] "can you do that automatically at 9am on weekdays" -> no tool
- [office] "turn this into a pdf" -> no tool
- [office] "convert my essay to word" -> no tool
- [office] "convert this mp4 to mp3" -> show_made
- [office] "shrink this video so I can email it" -> no tool
- [security] "is this email a scam?" -> no tool
- [security] "is this link safe to click" -> no tool
- [security] "has my email been in a breach" -> no tool
- [documents] "write that to a file" -> no tool
- [documents] "save this as notes.txt" -> no tool
- [documents] "jot this down in a text file" -> no tool
- [howtos] "remember how you did that" -> no tool
- [howtos] "do it the same way as last time" -> no tool
- [diagram] "can bob make flowcharts?" -> no tool
- [diagram] "draw a diagram of my game loop" -> list_folder
- [diagram] "map out how the login works" -> no tool
- [diagram] "show me the steps visually" -> no tool
- [diagram] "make a gantt chart for the next 6 weeks" -> notice_board
- [diagram] "pie chart of where my money goes" -> list_folder
- [save-as] "save it as a jpg" -> no tool
- [save-as] "can you save this as webm" -> no tool
- [picture] "I want a picture of my dog as a knight" -> no tool
- [picture] "mock up a cover for my book" -> no tool
- [files] "find my biggest files and clear space" -> list_folder
- [run] "compile the game" -> list_folder
- [office] "export this as a word doc" -> no tool
- [documents] "write a letter to my landlord and save it" -> office_make
- code uniqueSorted failed
- code camel failed
