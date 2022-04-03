"use strict";

// TODO: this should be the new way to generate a UID. At least, it can be proven that one is who they claim to be via some challenge.
const userIdentity = (async () => {
    const key = await window.crypto.subtle.generateKey({
                name: "ECDSA",
                namedCurve: "P-521", // Are there no other curve and how do I market this now as PQ?
            },
            false, // not extractable
            ["sign", "verify"]
        ).then(key => {
            console.log(key);
            return key;
        })
        .catch(err => {
            console.error(err);
        });
    const uid = await window.crypto.subtle.exportKey(
        "spki", //can be "jwk" (public or private), "spki" (public only), or "pkcs8" (private only)
        key.publicKey
    ).then(keydata => {
        console.log(keydata);
        return window.crypto.subtle.digest({
            name: "SHA-384"
        }, keydata);
    }).then(hash => {
        const strHash = Array.from(new Uint8Array(hash)).map(i => i.toString(16).padStart(2, '0')).join('');
        return strHash;
    }).catch(function(err) {
        console.error(err);
    });
    return {
        uid: uid,
        key: key
    };
})();
console.log(userIdentity); // this is just a promise, I need it resolved!!!

// Establish and manage the RTCDataChannels. Core örtchan protocol.

const chans = (() => {
    // User ID
    const uid = (() => {
        let array = new Uint8Array(24);
        self.crypto.getRandomValues(array);
        return Array.from(array).map(i => i.toString(16).padStart(2, '0')).join('');
    })();

    function peerName(chan) {
        if ('peerName' in chan) {
            return chan.peerName;
        }
        return "???";
    }

    let chans = []; // connections to peers.

    const loopbackChan = {
        peerName: uid,
        send: () => alert("please do not send to your loopback chan."),
    };

    function incomingMessage(logger, handler, chan) {
        return event => {
            logger(`handling received message from ${peerName(chan)}`);
            let d;
            try {
                d = JSON.parse(event.data);
            } catch (e) {
                appendChatBox(`From ${peerName(chan)}, unparsable: ${event.data}`);
                return;
            }

            // authenticity? LOL! but we leak your IP anyways.
            if ('setPeerName' in d) {
                if ('peerName' in chan && chan.peerName != d.setPeerName) {
                    logger(`ERROR: trying to rename ${chan.peerName} to ${d.setPeerName}. But renaming is not allowed.`);
                } else {
                    logger(`peer ${peerName(chan)} is now know as ${d.setPeerName}.`);
                    chan.peerName = d.setPeerName;
                    handler.peerName(d.setPeerName, chan);
                }
                delete d.setPeerName;
            }

            const pn = peerName(chan);

            if ('message' in d) {
                handler.message(pn, chan, d.message);
                delete d.message;
            }


            if ('request' in d) {
                if (d.request.method != "GET" && d.request.method != "POST") {
                    chan.send(JSON.stringify({
                        response: {
                            content: `request: unkown method "${d.request.method}"`,
                        },
                    }));
                } else if (!d.request.url) {
                    chan.send(JSON.stringify({
                        response: {
                            content: `request: needs url`,
                        },
                    }));
                } else {
                    handler.request(pn, chan, d.request);
                }
                delete d.request;
            }

            if ('response' in d) {
                handler.response(pn, chan, d.response);
                delete d.response;
            }

            if (Object.keys(d).length > 0) {
                handler.default(pn, chan, d);
            }
        };
    };


    const registerChanAndReady = (logger, onChanReady, incomingMessageHandler) => {
        return (chan) => {
            chans.push(chan);
            chan.onmessage = incomingMessage(logger, incomingMessageHandler, chan);
            onChanReady(chan);
        };
    };

    const offerLoop = async (logger, onChanReady, incomingMessageHandler) => {
        await chan.offer(logger, uid, registerChanAndReady(logger, onChanReady, incomingMessageHandler));
        setTimeout(offerLoop, 5000, logger, onChanReady, incomingMessageHandler)
    };
    const acceptLoop = async (logger, onChanReady, incomingMessageHandler) => {
        // Don't connect to self, don't connect if we already have a connection to that peer, and pick on remote peer at random.
        const selectRemotePeer = (uids) => {
            const us = uids.filter(u => u != uid && !chans.map(peerName).includes(u));
            return us[Math.floor(Math.random() * us.length)];
        };
        await chan.accept(logger, uid, selectRemotePeer, registerChanAndReady(logger, onChanReady, incomingMessageHandler));
        setTimeout(acceptLoop, 5000, logger, onChanReady, incomingMessageHandler)
    };

    return {
        uid: uid,
        peerName: peerName,
        chans: chans,
        loopbackChan: loopbackChan,
        offerLoop: offerLoop,
        acceptLoop: acceptLoop,
    };
})();