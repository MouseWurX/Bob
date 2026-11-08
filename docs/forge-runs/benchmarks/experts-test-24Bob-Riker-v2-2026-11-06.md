# Experts-per-word test, 2026-11-06T04-35-22

Model: Healed 24Bob (41 layers, 176 experts, 8 per word by default). Thinking off. Tool quiz: Bob's real prompt and all his tools, 97 plain requests from test/phrasings.js.

| Experts per word | Right tool | Facts | Code runs | Writing speed |
|---|---|---|---|---|
| 8 | 48/97 (49%) | 20/20 (100%) | 3/6 (50%) | 144.1 tok/s |

## Misses
### 8 per word
- [picture] "make a logo for my website" -> no tool
- [picture] "design a poster for my band" -> no tool
- [picture] "I need a thumbnail for my youtube video" -> no tool
- [picture] "can I get a banner for my twitch" -> no tool
- [files] "clean up my downloads" -> list_folder
- [files] "put all the pdfs in one folder" -> list_folder
- [files] "rename these photos by date" -> no tool
- [files] "zip up my project" -> list_folder
- [files] "unpack that archive" -> no tool
- [files] "move my screenshots to pictures" -> open_app
- [files] "my desktop is a mess, sort it out" -> list_folder
- [run] "run the tests" -> no tool
- [run] "install the dependencies" -> list_folder
- [run] "build my project" -> list_folder
- [run] "start the server" -> no tool
- [run] "git pull the latest" -> list_folder
- [run] "fire up the dev server" -> list_folder
- [schedules] "do this every friday" -> no tool
- [schedules] "each night back up my notes" -> notice_board,list_folder
- [schedules] "can you do that automatically at 9am on weekdays" -> no tool
- [apps] "take over my mouse and do it" -> no tool
- [office] "turn this into a pdf" -> no tool
- [office] "convert my essay to word" -> no tool
- [office] "make me some slides for my pitch" -> no tool
- [office] "read this excel file and tell me the total" -> no tool
- [office] "change cell B2 to 40" -> no tool
- [office] "convert this mp4 to mp3" -> list_folder
- [office] "shrink this video so I can email it" -> show_made
- [security] "is this email a scam?" -> no tool
- [security] "is this link safe to click" -> no tool
- [security] "has my email been in a breach" -> no tool
- [documents] "write that to a file" -> no tool
- [documents] "save this as notes.txt" -> no tool
- [documents] "jot this down in a text file" -> no tool
- [documents] "make a spreadsheet of my monthly bills" -> office_make
- [howtos] "remember how you did that" -> no tool
- [howtos] "do it the same way as last time" -> no tool
- [diagram] "can bob make flowcharts?" -> no tool
- [diagram] "draw a diagram of my game loop" -> no tool
- [diagram] "map out how the login works" -> no tool
- [diagram] "show me the steps visually" -> no tool
- [diagram] "pie chart of where my money goes" -> list_folder,office_read
- [save-as] "save it as a jpg" -> show_made
- [save-as] "can you save this as webm" -> no tool
- [files] "find my biggest files and clear space" -> ask_specialist
- [run] "compile the game" -> list_folder
- [office] "export this as a word doc" -> no tool
- [security] "did someone hack my account" -> no tool
- [documents] "write a letter to my landlord and save it" -> office_make
- code sumDigits failed
- code uniqueSorted failed
- code camel failed
