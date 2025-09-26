#!/bin/bash
set -e

# Directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$SCRIPT_DIR"

for dir in "$BASE_DIR"/*/; do
    [ -d "$dir" ] || continue
    echo "→ Found directory: $dir"

            echo "   ↳ Entering $dir"
            (
                cd "$dir"
                echo "     ↳ Cleaning with cmake-js..."
                npx cmake-js clean
                echo "     ↳ Installing npm packages..."
                npm install
            )
done
