build:
	make ts && \
	cd src && \
	rollup index.js -o ../bundle.js -e net,fs,os,process,http,https -f es
tsw:
	cd src && \
	tsc -w -t ES2019 index.ts
ts:
	cd src && \
	tsc -t ES2019 index.ts