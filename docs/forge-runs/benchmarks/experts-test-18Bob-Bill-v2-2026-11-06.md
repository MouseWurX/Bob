# Experts-per-word test, 2026-11-06T04-36-52

Model: Healed 18Bob (41 layers, 128 experts, 8 per word by default). Thinking off. Tool quiz: Bob's real prompt and all his tools, 97 plain requests from test/phrasings.js.

| Experts per word | Right tool | Facts | Code runs | Writing speed |
|---|---|---|---|---|
| 8 | 45/97 (46%) | 11/20 (55%) | 0/6 (0%) | 182.4 tok/s |

## Misses
### 8 per word
- [picture] "make a logo for my website" -> no tool
- [picture] "design a poster for my band" -> no tool
- [picture] "I need a thumbnail for my youtube video" -> no tool
- [picture] "can I get a banner for my twitch" -> no tool
- [music] "I need some background music for my game" -> no tool
- [files] "clean up my downloads" -> list_folder
- [files] "put all the pdfs in one folder" -> list_folder
- [files] "rename these photos by date" -> no tool
- [files] "zip up my project" -> list_folder
- [files] "unpack that archive" -> list_folder
- [files] "move my screenshots to pictures" -> list_folder
- [run] "install the dependencies" -> notice_board,list_folder
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
- [office] "change cell B2 to 40" -> show_made
- [office] "convert this mp4 to mp3" -> no tool
- [office] "shrink this video so I can email it" -> show_made
- [security] "is this email a scam?" -> no tool
- [security] "is this link safe to click" -> no tool
- [documents] "write that to a file" -> no tool
- [documents] "save this as notes.txt" -> no tool
- [documents] "jot this down in a text file" -> no tool
- [documents] "make a spreadsheet of my monthly bills" -> office_make
- [howtos] "remember how you did that" -> no tool
- [howtos] "do it the same way as last time" -> no tool
- [diagram] "can bob make flowcharts?" -> no tool
- [diagram] "draw a diagram of my game loop" -> list_folder
- [diagram] "map out how the login works" -> search_files,search_files,search_files
- [diagram] "show me the steps visually" -> no tool
- [diagram] "make a gantt chart for the next 6 weeks" -> notice_board
- [diagram] "pie chart of where my money goes" -> list_folder
- [save-as] "save that song as an mp3" -> no tool
- [save-as] "save it as a jpg" -> no tool
- [save-as] "can you save this as webm" -> no tool
- [picture] "sketch out a character for my game" -> no tool
- [picture] "I want a picture of my dog as a knight" -> no tool
- [files] "find my biggest files and clear space" -> list_folder
- [run] "compile the game" -> list_folder
- [office] "export this as a word doc" -> no tool
- [security] "did someone hack my account" -> no tool
- [schedules] "remind my pc to clean downloads weekly" -> notice_board
- [documents] "write a letter to my landlord and save it" -> office_make
- fact "How many minutes are in 3.5 hours? Just the number." -> 120
- fact "What is 17 times 23? Just the number." -> 1723
- fact "Convert 100 degrees Celsius to Fahrenheit. Just the number." -> 100
- fact "What is the square root of 144? Just the number." -> 14
- fact "If a train leaves at 14:40 and the trip takes 95 minutes, when does it arrive? HH:MM only." -> 14:30
- fact "How many bytes are in a kilobyte in the binary sense (KiB)? Just the number." -> 16
- fact "What is the freezing point of water in Kelvin? Just the number, two decimals." -> 0.0
- fact "What is 2 to the power of 10? Just the number." -> 10
- fact "A shirt costs $40 and is 25% off. What is the new price? Just the number." -> 20
- code isPalindrome failed
- code fizz failed
- code sumDigits failed
- code uniqueSorted failed
- code camel failed
- code countVowels failed
