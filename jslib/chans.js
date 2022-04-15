"use strict";
// My identity.
class UserIdentity {
    constructor(uidHash, key, displayName) {
        this.uidHash = uidHash;
        this.key = key;
        this.displayName = displayName;
    }
    static async uidHashFromPubKey(pk) {
        return window.crypto.subtle.exportKey("spki", //can be "jwk" (public or private), "spki" (public only), or "pkcs8" (private only)
        pk).then(keydata => {
            return window.crypto.subtle.digest({
                name: "SHA-384"
            }, keydata);
        }).then(hash => {
            return UserIdentity.hexlify(hash);
        });
    }
    // construct an object, async.
    static async create(logger, displayName) {
        const key = await window.crypto.subtle.generateKey(UserIdentity.pkAlgorithm, false, // not extractable
        ["sign", "verify"]).then(key => {
            return key;
        });
        logger(`created key type ${key.publicKey.algorithm.name}`, "DEBUG");
        const uidHash = await UserIdentity.uidHashFromPubKey(key.publicKey);
        return new UserIdentity(uidHash, key, displayName);
    }
    static encode(txt) {
        return new TextEncoder().encode(txt);
    }
    static hexlify(buf) {
        return Array.from(new Uint8Array(buf)).map(i => i.toString(16).padStart(2, '0')).join('');
    }
    static unhexlify(hex) {
        let result = new Uint8Array(hex.length / 2); // TODO: what if wrong size?
        for (let i = 0, l = hex.length; i < l; i += 2) {
            result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
        }
        return result;
    }
    async responseForChallenge(challenge) {
        // TODO: make sure we only sign stuff which looks like a challenge and not arbitrary strings.
        const signature = await window.crypto.subtle.sign(UserIdentity.algorithm, this.key.privateKey, UserIdentity.encode(challenge));
        const x = UserIdentity.hexlify(signature);
        return x;
    }
}
UserIdentity.algorithm = {
    name: "ECDSA",
    hash: { name: "SHA-384" },
};
UserIdentity.pkAlgorithm = {
    name: "ECDSA",
    namedCurve: "P-521", // Are there no other curve and how do I market this now as PQ?
};
// Remote identity.
class PeerIdentity {
    constructor(uidHash, pubKey, displayName) {
        this.uidHash = uidHash;
        this.pubKey = pubKey;
        this._displayName = displayName;
        this.verified = false; // whether remote is authenticated via challenge response.
    }
    static async init(pubKey, displayName, alreadyExistingDisplayNames) {
        const uidHash = await UserIdentity.uidHashFromPubKey(pubKey);
        return new PeerIdentity(uidHash, pubKey, PeerIdentity.uniqueDisplayName(uidHash, displayName, alreadyExistingDisplayNames));
    }
    static unknown() {
        return null;
    }
    // display names are untrusted data. But we try to have the locally unique per instance (but not globally unique).
    static uniqueDisplayName(suffixPool, proposedDisplayName, alreadyExistingDisplayNames) {
        let dn = proposedDisplayName;
        for (let cnt = 0; alreadyExistingDisplayNames.includes(dn); ++cnt) {
            dn = proposedDisplayName + suffixPool.slice(0, cnt);
        }
        return dn;
    }
    displayName() {
        if (!this.verified) {
            return `${this._displayName} (unverified)`;
        }
        return this._displayName;
    }
    rawDisplayName() {
        return this._displayName;
    }
    // TODO: factor out tooltip function
    displayNameHTML() {
        const s = document.createElement('span');
        s.classList.add('tooltippable');
        s.innerText = this.displayName();
        const tip = document.createElement('span');
        tip.classList.add('tooltip');
        tip.innerText = this.uidHash;
        s.appendChild(tip);
        return s;
    }
    generateChallenge() {
        this.challenge = window.crypto.randomUUID() + ":" + this.uidHash + ":" + this._displayName;
        return this.challenge;
    }
    async verifyResponse(response) {
        if (!this.challenge) {
            throw new Error("cannot verify a response if there is no challenge.");
        }
        let result = await window.crypto.subtle.verify(UserIdentity.algorithm, this.pubKey, UserIdentity.unhexlify(response), UserIdentity.encode(this.challenge));
        console.log(`verifyResponse: `, result);
        this.verified = result;
        return result;
    }
}
class ÖChan {
    constructor(c) {
        this.chan = c;
        this.authStatus = { selfAuthenticated: false };
    }
    mutuallyAuthenticated() {
        if (!this.peerIdentity) {
            return false;
        }
        return this.peerIdentity.verified && this.authStatus.selfAuthenticated;
    }
    // RTCDataChannel.send
    send(data) {
        return this.chan.send(data);
    }
    ;
    peerUID() {
        if (!this.peerIdentity) {
            return "???";
        }
        return this.peerIdentity.uidHash;
    }
    peerDisplayNameHTML() {
        if (!this.peerIdentity) {
            const s = document.createElement('span');
            s.innerText = '???';
            return s;
        }
        return this.peerIdentity.displayNameHTML();
    }
    peerFullIdentity() {
        if (!this.peerIdentity) {
            return "??? (no handshake yet)";
        }
        return `uid (public key hash): ${this.peerIdentity.uidHash}; verified: ${this.peerIdentity.verified}; display name: ${this.peerIdentity.displayName()}`;
    }
}
class Chans {
    constructor(uid, newC) {
        this.chans = []; // connections to peers.
        this.uid = uid;
        this.newC = newC;
        this.loopbackChan = Object.assign(new ÖChan(null), {
            send: (data) => alert("please do not send to your loopback chan."),
            peerUID: () => uid.uidHash.slice(0, 4) + "...(myself)",
            authStatus: { selfAuthenticated: true },
            mutuallyAuthenticated: () => true,
        });
    }
    // User ID
    myID() {
        return this.uid.uidHash;
    }
    knownDisplayNames() {
        let res = [];
        for (let c of this.chans) {
            if (c.peerIdentity) {
                res.push(c.peerIdentity.rawDisplayName());
            }
        }
        return res;
    }
    incomingMessage(logger, handler, chan) {
        return async (event) => {
            logger(`handling received message from ${chan.peerUID()}`, "INFO");
            let msg = {};
            {
                let d; // TODO: need a type-safe way if handling this untrusted user data!
                try {
                    d = JSON.parse(event.data);
                }
                catch (e) {
                    logger(`From ${chan.peerUID()}, unparsable: ${event.data}`, "WARNING");
                    return;
                }
                if (typeof d != "object" || d === null) {
                    logger(`From ${chan.peerUID()}, unparsable: ${event.data} did not return an object`, "WARNING");
                    return;
                }
                // TODO: recognize and sanitize!!!!
                for (const field of ['setPeerName', 'message', 'request', 'response']) {
                    msg[field] = d[field];
                    delete d[field];
                }
                if (Object.keys(d).length > 0) {
                    handler.default(chan, d); // TODO: I should just dummp this to the logger here and remove this API
                }
            }
            if (msg.setPeerName) {
                const m = msg.setPeerName;
                if (chan.peerIdentity && m.initial) {
                    logger(`ERROR: trying to rename ${chan.peerIdentity.displayName()}. But renaming is not allowed.`, "ERROR");
                    return;
                }
                const onMutuallyAuthenticated = () => {
                    if (chan.mutuallyAuthenticated()) {
                        handler.mutuallyAuthenticated(chan);
                    }
                };
                if (m.initial) {
                    const pk = await window.crypto.subtle.importKey('spki', UserIdentity.unhexlify(m.initial.pubKey), UserIdentity.pkAlgorithm, true, ['verify']);
                    const remotePeer = await PeerIdentity.init(pk, m.initial.displayName, this.knownDisplayNames());
                    chan.peerIdentity = remotePeer;
                    const challenge = remotePeer.generateChallenge();
                    logger(`peer is now claiming to be ${chan.peerUID()}. Sending challenge to verify.`, "INFO");
                    chan.send(JSON.stringify({
                        setPeerName: { challenge: challenge },
                    }));
                }
                else if (m.challenge) {
                    const response = await this.uid.responseForChallenge(m.challenge);
                    chan.send(JSON.stringify({
                        setPeerName: { response: response },
                    }));
                    // we should now be authenitcated - given remote accepts our response. Waiting for acknowledge.
                }
                else if (m.response) {
                    if (!chan.peerIdentity) {
                        logger(`Received a response but don't have a peerIentity yet`, "ERROR");
                        return;
                    }
                    const verified = await chan.peerIdentity.verifyResponse(m.response);
                    if (!verified) {
                        logger(`Failed to verify ${chan.peerUID()}. Invalid repsonse.`);
                        return;
                    }
                    chan.send(JSON.stringify({
                        setPeerName: { acknowledge: true },
                    }));
                    // remote is now authenticated.
                    onMutuallyAuthenticated();
                }
                else if (m.acknowledge) {
                    chan.authStatus.selfAuthenticated = true;
                    onMutuallyAuthenticated();
                }
                delete msg.setPeerName;
            }
            if (msg.message) {
                handler.message(chan, msg.message.toString());
                delete msg.message;
            }
            if (msg.request) {
                if (msg.request.method != "GET" && msg.request.method != "POST") {
                    chan.send(JSON.stringify({
                        response: {
                            content: `request: unkown method "${msg.request.method}"`,
                        },
                    }));
                }
                else if (!msg.request.url) {
                    chan.send(JSON.stringify({
                        response: {
                            content: `request: needs url`,
                        },
                    }));
                }
                else {
                    handler.request(chan, msg.request);
                }
                delete msg.request;
            }
            if (msg.response) {
                handler.response(chan, msg.response);
                delete msg.response;
            }
        };
    }
    broadcast(jsonmsg) {
        for (let c of this.chans) {
            console.log("sending a message to", c);
            try {
                c.send(jsonmsg);
            }
            catch (error) {
                console.log("sending failed:", error);
            }
            ;
        }
    }
    registerChanAndReady(logger, onChanReady, incomingMessageHandler) {
        return async (chan) => {
            const c = this.newC(chan);
            c.peerIdentity = PeerIdentity.unknown();
            this.chans.push(c);
            chan.onmessage = this.incomingMessage(logger, incomingMessageHandler, c);
            const pk = await window.crypto.subtle.exportKey('spki', this.uid.key.publicKey);
            chan.send(JSON.stringify({
                setPeerName: {
                    initial: {
                        displayName: this.uid.displayName,
                        pubKey: UserIdentity.hexlify(pk),
                    },
                },
            }));
            logger("Sending a Howdy! (we are likely nor yet verified)", "INFO");
            chan.send(JSON.stringify({
                setPeerName: this.myID(),
                message: `Howdy! ${this.myID()} just connected by providing you an offer.`
            }));
            onChanReady(c);
        };
    }
    async offerLoop(logger, onChanReady, incomingMessageHandler) {
        await chan.offer(logger, this.myID(), this.registerChanAndReady(logger, onChanReady, incomingMessageHandler));
        setTimeout(() => this.offerLoop(logger, onChanReady, incomingMessageHandler), 5000);
    }
    async acceptLoop(logger, onChanReady, incomingMessageHandler) {
        // Don't connect to self, don't connect if we already have a connection to that peer, and pick on remote peer at random.
        const selectRemotePeer = (uids) => {
            const us = uids.filter(u => u != this.myID() && !this.chans.map(c => c.peerUID()).includes(u));
            return us[Math.floor(Math.random() * us.length)];
        };
        await chan.accept(logger, selectRemotePeer, this.registerChanAndReady(logger, onChanReady, incomingMessageHandler));
        setTimeout(() => this.acceptLoop(logger, onChanReady, incomingMessageHandler), 5000);
    }
}
