#!/bin/sh
# Bob from the command line (src/bob-cli.js): bob ask "question", bob status, bob models. Needs Node 20 or newer.
# Mac and Linux: run it as  sh bob.sh ask "hi", or copy src/bob-cli.js anywhere and run  node bob-cli.js ask "hi".
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$here/../src/bob-cli.js" "$@"
