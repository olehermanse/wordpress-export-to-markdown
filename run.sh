#!/usr/bin/env bash
rm -rf output/ && \
    node index.js \
    --post-type pt_blog \
    --wizard false \
    --input export.xml \
    --output output \
    --year-folders true \
    --month-folders false \
    --post-folders false \
    --save-attached-images true \
    --save-scraped-images true \
    --original-url true \
    --markdown true \
    --pandoc true \
    --json true \
    --yaml true \
    --html true

find output -name '*.md.html' -exec rm {} \;
find output -name '*.md.json' -exec rm {} \;
find output -name '*.md.frontmatter.yaml' -exec rm {} \;
