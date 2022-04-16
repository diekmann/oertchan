#!/bin/bash

set -e

#TODO: regularly get newest version. Vong security updates und so.
wget --no-clobber --output-document=firefox.tar.bz2 'https://download.mozilla.org/?product=firefox-nightly-latest-ssl&os=linux64&lang=en-US'

# TODO: cleanup if new ff downloaded
tar -xjf firefox.tar.bz2
bwrap --new-session --ro-bind /usr /usr --dir /tmp --dir /var \
	--ro-bind /etc/resolv.conf /etc/resolv.conf \
	--proc /proc \
	--dev /dev \
	--symlink usr/lib /lib \
	--symlink usr/lib64 /lib64 \
	--symlink usr/bin /bin \
	--unshare-all \
	--share-net \
	--die-with-parent \
	--chdir / \
	--ro-bind ./firefox /firefox \
	--setenv PATH "/firefox:/usr/bin:/bin" \
	/firefox/firefox --headless --new-instance 'https://diekmann.github.io/oertchan/servers/wiki.html' 'https://diekmann.github.io/oertchan/servers/ping.html' 'https://diekmann.github.io/oertchan/servers/anonrelay.html'
