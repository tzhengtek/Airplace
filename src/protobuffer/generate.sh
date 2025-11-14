#!/bin/bash

# Generate Go code
protoc --go_out=. --go_opt=paths=source_relative \
       --go_opt=Mpixel.proto=protobuffer/pixelpb \
       pixel.proto

# Generate JavaScript code (for Node.js Discord bot)
# Install: npm install -g protoc-gen-js
protoc --js_out=import_style=commonjs,binary:./js \
       pixel.proto

# Generate TypeScript definitions (optional but recommended)
# Install: npm install -g ts-protoc-gen
protoc --plugin=protoc-gen-ts=./node_modules/.bin/protoc-gen-ts \
       --ts_out=./js \
       pixel.proto

echo "✅ Generated code for Go and JavaScript"
