"use strict";

// Establish and manage the RTCDataChannels. Core örtchan protocol.


type IncomingMessageHandler<C> = {
    peerName: (peerName: string, chan: C) => void,
    message: (peerName: string, chan: C, message: any) => void,
    request: (peerName: string, chan: C, request: any) => void,
    response: (peerName: string, chan: C, response: any) => void,
    default: (peerName: string, chan: C, d: any) => void,
};


// TODO: this should be the new way to generate a UID. At least, it can be proven that one is who they claim to be via some challenge.
class UserIdentity {
    private constructor(uidHash: string, key: CryptoKeyPair){
        this.uidHash = uidHash;
        this.key = key;
    }

    public uidHash: string;
    public key: CryptoKeyPair;

    static async uidHashFromPubKey(pk: CryptoKey): Promise<string> {
        return window.crypto.subtle.exportKey(
            "spki", //can be "jwk" (public or private), "spki" (public only), or "pkcs8" (private only)
            pk
        ).then(keydata => {
            return window.crypto.subtle.digest({
                name: "SHA-384"
            }, keydata);
        }).then(hash => {
            const strHash = Array.from(new Uint8Array(hash)).map(i => i.toString(16).padStart(2, '0')).join('');
            return strHash;
        })
    }

    // construct an object, async.
    static async create(logger: Logger) {
        const key = await window.crypto.subtle.generateKey({
                    name: "ECDSA",
                    namedCurve: "P-521", // Are there no other curve and how do I market this now as PQ?
                },
                false, // not extractable
                ["sign", "verify"]
            ).then(key => {
                return key;
            });
        logger(`created key type ${key.publicKey.algorithm.name}`, "DEBUG");
        const uidHash = await UserIdentity.uidHashFromPubKey(key.publicKey);

        return new UserIdentity(uidHash, key);
    }
}

// TODO: use me
class PeerIdentity {
    public uidHash: string; // TODO: UserIdentity.uidHashFromPubKey
    public pubKey: CryptoKey;
    private _displayName: string;
    public verified: boolean;

    constructor(uidHash: string, pubKey: CryptoKey, displayName: string) {
        this.uidHash = uidHash;
        this.pubKey = pubKey;
        this._displayName = displayName;
    }
    
    displayName(): string {
        if (this.verified) {
            return this._displayName;
        }
        return `${this._displayName} (unverified)`;
    }

    private challenge: string;
    generateChallenge(): string {
        this.challenge = self.crypto.randomUUID() + ":" + this.uidHash + ":" + this._displayName ;
        return this.challenge;
    }

}


interface ÖChan  {
    // TODO: how do I model monkey patching in TypeScript
    //private thePeerName?: string;
    //setPeerName(pn: string): void;
    peerName?: string;

    // RTCDataChannel.send
    send: (data: string) => void;

    //private chan: RTCDataChannel;
}

class Chans<C extends ÖChan> {
    private uid: UserIdentity;
    public loopbackChan: C;

    private newC: (chan: RTCDataChannel) => C;
    public chans: C[] = []; // connections to peers.

    constructor(uid: UserIdentity, newC: (chan: RTCDataChannel) => C) {
        this.uid = uid;
        this.newC = newC;

        this.loopbackChan = {
            peerName: this.myID(),
            send: () => alert("please do not send to your loopback chan."),
        } as unknown as C;
    }

    // User ID
    myID(): string {
        return this.uid.uidHash;
    }

    // TODO: remove, use ÖChan directly!
    static peerName(chan: ÖChan): string {
        if ('peerName' in chan) {
            return chan.peerName;
        }
        return "???";
    }

    private incomingMessage(logger: Logger, handler: IncomingMessageHandler<C>, chan: C) {
        return (event: MessageEvent) => {
            logger(`handling received message from ${Chans.peerName(chan)}`, "INFO");
            let d;
            try {
                d = JSON.parse(event.data);
            } catch (e) {
                logger(`From ${Chans.peerName(chan)}, unparsable: ${event.data}`, "WARNING");
                return;
            }

            // authenticity? LOL! but we leak your IP anyways.
            if ('setPeerName' in d) {
                if ('peerName' in chan && chan.peerName != d.setPeerName) {
                    logger(`ERROR: trying to rename ${chan.peerName} to ${d.setPeerName}. But renaming is not allowed.`, "ERROR");
                } else {
                    logger(`peer ${Chans.peerName(chan)} is now know as ${d.setPeerName}.`, "INFO");
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
    }

    broadcast(jsonmsg: string){
        for (let c of this.chans) {
            console.log("sending a message to", c);
            try {
                c.send(jsonmsg);
            } catch (error) {
                console.log("sending failed:", error);
            };
        }
    }

    private registerChanAndReady(logger: Logger, onChanReady: (chan: C) => void, incomingMessageHandler: IncomingMessageHandler<C>): (chan: RTCDataChannel) => void {
        return (chan) => {
            const c: C = this.newC(chan);
            this.chans.push(c);
            chan.onmessage = this.incomingMessage(logger, incomingMessageHandler, c);
            logger("Sending a Howdy!", "INFO");
            chan.send(JSON.stringify({
                setPeerName: this.myID(),
                message: `Howdy! ${this.myID()} just connected by providing you an offer.`
            }));
            onChanReady(c);
        };
    }

    async offerLoop(logger: Logger, onChanReady: (chan: C) => void, incomingMessageHandler: IncomingMessageHandler<C>) {
        await chan.offer(logger, this.myID(), this.registerChanAndReady(logger, onChanReady, incomingMessageHandler));
        setTimeout(() => this.offerLoop(logger, onChanReady, incomingMessageHandler), 5000)
    }

    async acceptLoop(logger: Logger, onChanReady: (chan: C) => void, incomingMessageHandler: IncomingMessageHandler<C>) {
        // Don't connect to self, don't connect if we already have a connection to that peer, and pick on remote peer at random.
        const selectRemotePeer = (uids: string[]): string => {
            const us = uids.filter(u => u != this.myID() && !this.chans.map(Chans.peerName).includes(u));
            return us[Math.floor(Math.random() * us.length)];
        };
        await chan.accept(logger, this.myID(), selectRemotePeer, this.registerChanAndReady(logger, onChanReady, incomingMessageHandler));
        setTimeout(() => this.acceptLoop(logger, onChanReady, incomingMessageHandler), 5000)
    }
}
