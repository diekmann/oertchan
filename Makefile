CC = tsc  # node-typescript

all:
	mkdir -p ./public
	cp -a *.html ./public/
	mkdir -p ./public/jslib
	cp -a ./jslib/*.html ./public/jslib/
	mkdir -p ./public/servers
	cp -a ./servers/*.html ./public/servers/
	tsc ||  echo "yolo TODO fix errors"

clean:
	rm -rf ./public