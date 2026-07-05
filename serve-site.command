#!/bin/bash
# Double-click me to preview the Made by MJ site at http://localhost:5500
cd "$(dirname "$0")"
open "http://localhost:5500"
python3 -m http.server 5500
