# Experts-per-word test, 2026-11-05T13-27-01

Model: Healed 18Bob (41 layers, 128 experts, 8 per word by default). Thinking off. Tool quiz: Bob's real prompt and all his tools, 97 plain requests from test/phrasings.js.

| Experts per word | Right tool | Facts | Code runs | Writing speed |
|---|---|---|---|---|
| 8 | 45/97 (46%) | 12/20 (60%) | 0/6 (0%) | 183.3 tok/s |

## Misses
### 8 per word
- [picture] "make a logo for my website" -> no tool
- [picture] "design a poster for my band" -> no tool
- [picture] "I need a thumbnail for my youtube video" -> no tool
- [picture] "can I get a banner for my twitch" -> no tool
- [files] "clean up my downloads" -> list_folder
- [files] "put all the pdfs in one folder" -> list_folder,list_folder,list_folder,list_folder
- [files] "rename these photos by date" -> list_folder
- [files] "zip up my project" -> list_folder
- [files] "unpack that archive" -> list_folder
- [files] "move my screenshots to pictures" -> list_folder
- [files] "undo that" -> no tool
- [files] "my desktop is a mess, sort it out" -> list_folder
- [run] "run the tests" -> list_folder
- [run] "install the dependencies" -> list_folder,search_files,search_files,search_files,search_files
- [run] "build my project" -> no tool
- [run] "start the server" -> no tool
- [run] "fire up the dev server" -> list_folder,list_folder
- [schedules] "every morning tidy my downloads" -> list_folder
- [schedules] "do this every friday" -> no tool
- [schedules] "each night back up my notes" -> notice_board,list_folder
- [schedules] "can you do that automatically at 9am on weekdays" -> no tool
- [office] "turn this into a pdf" -> no tool
- [office] "convert my essay to word" -> no tool
- [office] "make me some slides for my pitch" -> no tool
- [office] "convert this mp4 to mp3" -> no tool
- [office] "shrink this video so I can email it" -> no tool
- [security] "is this email a scam?" -> no tool
- [security] "is this link safe to click" -> no tool
- [security] "has my email been in a breach" -> no tool
- [documents] "write that to a file" -> no tool
- [documents] "save this as notes.txt" -> no tool
- [documents] "jot this down in a text file" -> no tool
- [documents] "make a spreadsheet of my monthly bills" -> ask_specialist
- [howtos] "remember how you did that" -> no tool
- [howtos] "do it the same way as last time" -> no tool
- [diagram] "can bob make flowcharts?" -> no tool
- [diagram] "draw a diagram of my game loop" -> no tool
- [diagram] "map out how the login works" -> search_files,search_files,search_files
- [diagram] "show me the steps visually" -> no tool
- [diagram] "make a gantt chart for the next 6 weeks" -> no tool
- [diagram] "pie chart of where my money goes" -> no tool
- [save-as] "save it as a jpg" -> no tool
- [save-as] "can you save this as webm" -> no tool
- [picture] "sketch out a character for my game" -> no tool
- [picture] "I want a picture of my dog as a knight" -> no tool
- [picture] "mock up a cover for my book" -> no tool
- [files] "find my biggest files and clear space" -> run_command
- [run] "compile the game" -> list_folder,list_folder,list_folder
- [office] "export this as a word doc" -> no tool
- [security] "did someone hack my account" -> no tool
- [schedules] "remind my pc to clean downloads weekly" -> reminders
- [documents] "write a letter to my landlord and save it" -> no tool
- fact "How many minutes are in 3.5 hours? Just the number." -> 15
- fact "What is 17 times 23? Just the number." -> 1723
- fact "Convert 100 degrees Celsius to Fahrenheit. Just the number." -> 1
- fact "What is the square root of 144? Just the number." -> 14
- fact "If a train leaves at 14:40 and the trip takes 95 minutes, when does it arrive? HH:MM only." -> 14:45
- fact "How many bytes are in a kilobyte in the binary sense (KiB)? Just the number." -> 1
- fact "What is the freezing point of water in Kelvin? Just the number, two decimals." -> 3.0
- fact "What is 2 to the power of 10? Just the number." -> 10
- code isPalindrome failed
- code fizz failed
- code sumDigits failed
- code uniqueSorted failed
- code camel failed
- code countVowels failed
