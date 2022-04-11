"use strict";
// TODO: this should be the new way to generate a UID. At least, it can be proven that one is who they claim to be via some challenge.
class UserIdentity {
    constructor(uidHash, key) {
        this.uidHash = uidHash;
        this.key = key;
    }
    // construct an onject, async.
    static async create(logger) {
        const key = await window.crypto.subtle.generateKey({
            name: "ECDSA",
            namedCurve: "P-521", // Are there no other curve and how do I market this now as PQ?
        }, false, // not extractable
        ["sign", "verify"]).then(key => {
            return key;
        });
        logger(`created key type ${key.publicKey.algorithm.name}`);
        const uidHash = await window.crypto.subtle.exportKey("spki", //can be "jwk" (public or private), "spki" (public only), or "pkcs8" (private only)
        key.publicKey).then(keydata => {
            return window.crypto.subtle.digest({
                name: "SHA-384"
            }, keydata);
        }).then(hash => {
            const strHash = Array.from(new Uint8Array(hash)).map(i => i.toString(16).padStart(2, '0')).join('');
            return strHash;
        });
        return new UserIdentity(uidHash, key);
    }
}
class Chans {
    constructor(uid) {
        this.chans = []; // connections to peers.
        this.uid = uid;
        this.loopbackChan = {
            peerName: this.myID(),
            send: () => alert("please do not send to your loopback chan."),
        };
    }
    // User ID
    myID() {
        return this.uid.uidHash;
    }
    static toÖChan(chan) {
        return Object.assign(chan, {}); // TODO
    }
    // TODO: remove, use ÖChan directly!
    static peerName(chan) {
        if ('peerName' in chan) {
            return chan.peerName;
        }
        return "???";
    }
    static incomingMessage(logger, handler, chan) {
        return event => {
            logger(`handling received message from ${Chans.peerName(chan)}`);
            let d;
            try {
                d = JSON.parse(event.data);
            }
            catch (e) {
                logger(`From ${Chans.peerName(chan)}, unparsable: ${event.data}`);
                return;
            }
            // authenticity? LOL! but we leak your IP anyways.
            if ('setPeerName' in d) {
                if ('peerName' in chan && chan.peerName != d.setPeerName) {
                    logger(`ERROR: trying to rename ${chan.peerName} to ${d.setPeerName}. But renaming is not allowed.`);
                }
                else {
                    logger(`peer ${Chans.peerName(chan)} is now know as ${d.setPeerName}.`);
                    chan.peerName = d.setPeerName;
                    handler.peerName(d.setPeerName, chan);
                }
                delete d.setPeerName;
            }
            const pn = Chans.peerName(chan);
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
                }
                else if (!d.request.url) {
                    chan.send(JSON.stringify({
                        response: {
                            content: `request: needs url`,
                        },
                    }));
                }
                else {
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
    }
    registerChanAndReady(logger, onChanReady, incomingMessageHandler) {
        return (chan) => {
            const öc = Chans.toÖChan(chan);
            this.chans.push(öc);
            öc.onmessage = Chans.incomingMessage(logger, incomingMessageHandler, öc);
            onChanReady(öc);
        };
    }
    async offerLoop(logger, onChanReady, incomingMessageHandler) {
        await chan.offer(logger, this.myID(), this.registerChanAndReady(logger, onChanReady, incomingMessageHandler));
        setTimeout(() => this.offerLoop(logger, onChanReady, incomingMessageHandler), 5000);
    }
    async acceptLoop(logger, onChanReady, incomingMessageHandler) {
        // Don't connect to self, don't connect if we already have a connection to that peer, and pick on remote peer at random.
        const selectRemotePeer = (uids) => {
            const us = uids.filter(u => u != this.myID() && !this.chans.map(Chans.peerName).includes(u));
            return us[Math.floor(Math.random() * us.length)];
        };
        await chan.accept(logger, this.myID(), selectRemotePeer, this.registerChanAndReady(logger, onChanReady, incomingMessageHandler));
        setTimeout(() => this.acceptLoop(logger, onChanReady, incomingMessageHandler), 5000);
    }
}
