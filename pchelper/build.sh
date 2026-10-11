#!/bin/sh
set -e
cd "$(dirname "$0")"

# mac amd64, mac arm64, windows amd64
for rid in osx-x64 osx-arm64 win-x64; do
    dotnet publish -c Release -r "$rid" --self-contained true \
        -p:PublishSingleFile=true -o "publish/$rid"
done
