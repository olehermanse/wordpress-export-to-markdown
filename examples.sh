#/usr/bin/env bash
node index.js --wizard false --input examples/01_posts/export.xml --output examples/01_posts/output --year-folders true --month-folders false --post-folders false --save-attached-images true --save-scraped-images true
node index.js --post-type pt_blog --wizard false --input examples/02_blog/export.xml --output examples/02_blog/output --year-folders true --month-folders false --post-folders false --save-attached-images true --save-scraped-images true
