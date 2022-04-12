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
    private constructor(uidHash: string, key: CryptoKeyPair, displayName: string){
        this.uidHash = uidHash;
        this.key = key;
        this.displayName = displayName;
    }

    public static readonly algorithm: EcdsaParams = {
        name: "ECDSA",
        hash: {name: "SHA-384"},
      };
    public static readonly pkAlgorithm: EcKeyGenParams = {
        name: "ECDSA",
        namedCurve: "P-521", // Are there no other curve and how do I market this now as PQ?
    };

    public readonly displayName: string;
    public readonly uidHash: string;
    public readonly key: CryptoKeyPair;

    static async uidHashFromPubKey(pk: CryptoKey): Promise<string> {
        return window.crypto.subtle.exportKey(
            "spki", //can be "jwk" (public or private), "spki" (public only), or "pkcs8" (private only)
            pk
        ).then(keydata => {
            return window.crypto.subtle.digest({
                name: "SHA-384"
            }, keydata);
        }).then(hash => {
            return UserIdentity.hexlify(hash);
        })
    }

    // construct an object, async.
    static async create(logger: Logger, displayName: string) {
        const key = await window.crypto.subtle.generateKey(
                UserIdentity.pkAlgorithm,
                false, // not extractable
                ["sign", "verify"]
            ).then(key => {
                return key;
            });
        logger(`created key type ${key.publicKey.algorithm.name}`, "DEBUG");
        const uidHash = await UserIdentity.uidHashFromPubKey(key.publicKey);

        return new UserIdentity(uidHash, key, displayName);
    }

    static encode(txt: string): Uint8Array {
        return new TextEncoder().encode(txt);
    }
    static hexlify(buf: ArrayBuffer): string {
        return Array.from(new Uint8Array(buf)).map(i => i.toString(16).padStart(2, '0')).join('');
    }
    static unhexlify(hex: string): Uint8Array {
        let result = new Uint8Array(hex.length/2); // TODO: what if wrong size?
        for (let i=0, l=hex.length; i<l; i+=2) {
            result[i/2] = parseInt(hex.slice(i, i+2), 16);
        }
        return result;
    }

    async responseForChallenge(challenge: string): Promise<string> {
        const signature = await window.crypto.subtle.sign(
            UserIdentity.algorithm,
            this.key.privateKey,
            UserIdentity.encode(challenge),
          );
        const x = UserIdentity.hexlify(signature);
        return x;
    }
}

// TODO: use me
class PeerIdentity {
    public uidHash: string;
    public pubKey: CryptoKey;
    private _displayName: string;
    public verified: boolean;

    private constructor(uidHash: string, pubKey: CryptoKey, displayName: string) {
        this.uidHash = uidHash;
        this.pubKey = pubKey;
        this._displayName = displayName;
    }

    static async init(pubKey: CryptoKey, displayName: string): Promise<PeerIdentity> {
        const uidHash = await UserIdentity.uidHashFromPubKey(pubKey);
        return new PeerIdentity(uidHash, pubKey, displayName);
    }
    
    // TODO: I also need to print the uidHashes, since this is the only verified thing. And resolve displayName collisions.
    displayName(): string {
        if (this.verified) {
            return this._displayName;
        }
        return `${this._displayName} (unverified)`;
    }

    private challenge: string;
    generateChallenge(): string {
        this.challenge = window.crypto.randomUUID() + ":" + this.uidHash + ":" + this._displayName ;
        return this.challenge;
    }
    async verifyResponse(response: string): Promise<boolean> {
        let result = await window.crypto.subtle.verify(
            UserIdentity.algorithm,
            this.pubKey,
            UserIdentity.unhexlify(response),
            UserIdentity.encode(this.challenge)
          );
        console.log(`verifyResponse: `, result);
        this.verified = result;
        return result;
    }

}


// TODO: use me
type SetPeerNameMessage = {
    initial?: {
        pubKey: string; // hexlified spki
        displayName: string; // user-chosen untrusted string
    };
    challenge?: string;
    response?: string;
    
}


interface ÖChan  {
    // TODO: how do I model monkey patching in TypeScript
    //private thePeerName?: string;
    //setPeerName(pn: string): void;
    //peerName?: string;

    peerIdentity?: PeerIdentity;

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
        if ('peerIdentity' in chan) {
            return chan.peerIdentity.uidHash;
            //return chan.peerIdentity.displayName();
        }
        return "???";
    }

    private incomingMessage(logger: Logger, handler: IncomingMessageHandler<C>, chan: C) {
        return async (event: MessageEvent) => {
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
                const m = <SetPeerNameMessage>d.setPeerName;
                if ('peerIdentity' in chan && m.initial) {
                    logger(`ERROR: trying to rename ${chan.peerIdentity.displayName()}. But renaming is not allowed.`, "ERROR");
                    return;
                }
                if (m.initial) {
                    const pk = await window.crypto.subtle.importKey(
                        'spki',
                        UserIdentity.unhexlify(m.initial.pubKey),
                        UserIdentity.pkAlgorithm,
                        true,
                        ['verify']
                    );
                    const remotePeer = await PeerIdentity.init(pk, m.initial.displayName);
                    chan.peerIdentity = remotePeer;
                    const challenge = remotePeer.generateChallenge();
                    logger(`peer is now claiming to be ${Chans.peerName(chan)}. Sending challenge to verify.`, "INFO");
                    chan.send(JSON.stringify({
                        setPeerName: <SetPeerNameMessage>{challenge: challenge},
                    }));
                } else if (m.challenge) {
                    const response = await this.uid.responseForChallenge(m.challenge);
                    chan.send(JSON.stringify({
                        setPeerName: <SetPeerNameMessage>{response: response},
                    }));
                    return;
                } else if (m.response) {
                    const verified = chan.peerIdentity.verifyResponse(m.response);
                    if (!verified) {
                        logger(`Failed to verify ${Chans.peerName(chan)}. Invalid repsonse.`)
                        return;
                    }
                    // now we are authenitcated.
                    handler.peerName(d.setPeerName, chan); // TODO: remove first param, make sure chan has well-defined user identity
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
        return async (chan) => {
            const c: C = this.newC(chan);
            this.chans.push(c);
            chan.onmessage = this.incomingMessage(logger, incomingMessageHandler, c);
            const pk = await window.crypto.subtle.exportKey('spki', this.uid.key.publicKey);
            chan.send(JSON.stringify({
                setPeerName: <SetPeerNameMessage>{
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

    async offerLoop(logger: Logger, onChanReady: (chan: C) => void, incomingMessageHandler: IncomingMessageHandler<C>) {
        await chan.offer(logger, this.myID(), this.registerChanAndReady(logger, onChanReady, incomingMessageHandler));
        setTimeout(() => this.offerLoop(logger, onChanReady, incomingMessageHandler), 5000)
    }

    async acceptLoop(logger: Logger, onChanReady: (chan: C) => void, incomingMessageHandler: IncomingMessageHandler<C>) {
        // Don't connect to self, don't connect if we already have a connection to that peer, and pick on remote peer at random.
        const selectRemotePeer = (uids: string[]): string => {
            // TODO: need to preserve the UID here!!!!!!
            const us = uids.filter(u => u != this.myID() && !this.chans.map(Chans.peerName).includes(u));
            return us[Math.floor(Math.random() * us.length)];
        };
        await chan.accept(logger, selectRemotePeer, this.registerChanAndReady(logger, onChanReady, incomingMessageHandler));
        setTimeout(() => this.acceptLoop(logger, onChanReady, incomingMessageHandler), 5000)
    }
}
