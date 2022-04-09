CC = tsc  # node-typescript

all:
	mkdir -p ./public
	cp -a *.html ./public
	mkdir -p ./public/servers
	cp -a ./servers/*.html ./public/servers
	tsc

clean:
	rm -rf ./public