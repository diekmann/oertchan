#!/bin/bash

set -e

#TODO: regularly get newest version. Vong security updates und so.
wget --no-clobber --output-document=firefox.tar.bz2 'https://download.mozilla.org/?product=firefox-nightly-latest-ssl&os=linux64&lang=en-US'

# TODO: cleanup if new ff downloaded
tar -xjf firefox.tar.bz2
./firefox/firefox --headless 'https://diekmann.github.io/oertchan/servers/wiki.html' 'https://diekmann.github.io/oertchan/servers/ping.html' 'https://diekmann.github.io/oertchan/servers/anonrelay.html'
