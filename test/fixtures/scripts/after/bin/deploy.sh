#!/usr/bin/env bash
set -euo pipefail

build() {
  npm run build
}

publish() {
  build
  upload dist/
}

upload() {
  aws s3 sync "$1" "s3://$BUCKET"
}

publish
