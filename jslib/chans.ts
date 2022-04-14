"use strict";

// Establish and manage the RTCDataChannels. Core örtchan protocol.


type IncomingMessageHandler<C> = {
    mutuallyAuthenticated: (peerName: string, chan: C) => void,
    message: (peerName: string, chan: C, message: any) => void,
    request: (peerName: string, chan: C, request: any) => void,
    response: (peerName: string, chan: C, response: any) => void,
    default: (peerName: string, chan: C, d: any) => void,
};


// My identity.
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

// Remote identity.
class PeerIdentity {
    public uidHash: string;
    public pubKey: CryptoKey;
    private _displayName: string;
    public verified: boolean;

    private constructor(uidHash: string, pubKey: CryptoKey, displayName: string) {
        this.uidHash = uidHash;
        this.pubKey = pubKey;
        this._displayName = displayName;
        this.verified = false; // whether remote is authenticated via challenge response.
    }

    static async init(pubKey: CryptoKey, displayName: string, alreadyExistingDisplayNames: string[]): Promise<PeerIdentity> {
        const uidHash = await UserIdentity.uidHashFromPubKey(pubKey);
        return new PeerIdentity(uidHash, pubKey, PeerIdentity.uniqueDisplayName(uidHash, displayName, alreadyExistingDisplayNames));
    }
    static unknown(): PeerIdentity {
        return null
    }

    // display names are untrusted data. But we try to have the locally unique per instance (but not globally unique).
    private static uniqueDisplayName(suffixPool: string, proposedDisplayName: string, alreadyExistingDisplayNames: string[]): string {
        let dn = proposedDisplayName;
        for (let cnt = 0; alreadyExistingDisplayNames.includes(dn); ++cnt) {
            dn = proposedDisplayName + suffixPool.slice(0, cnt);
        }
        return dn;
    }
    
    // TODO: I also need to print the uidHashes, since this is the only verified thing. And resolve displayName collisions.
    displayName(): string {
        if (!this.verified) {
            return `${this._displayName} (unverified)`;
        }
        return this._displayName;
    }

    rawDisplayName(): string {
        return this._displayName;
    }

    // TODO: factor out tooltip function
    displayNameHTML(): HTMLSpanElement {
        const s = document.createElement('span');
        s.classList.add('tooltippable');
        s.innerText = this.displayName();
        const tip = document.createElement('span');
        tip.classList.add('tooltip');
        tip.innerText = this.uidHash
        s.appendChild(tip);
        return s;
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

type SetPeerNameMessage = {
    initial?: {
        pubKey: string; // hexlified spki
        displayName: string; // user-chosen untrusted string
    };
    challenge?: string;
    response?: string;
    
}


class ÖChan {
    // warning, this may be an unknown PeerIdentity, i.e. null!
    public peerIdentity: PeerIdentity;
    public authStatus: {
        selfResponseSent: boolean // whether we have sent our response to remote's challenge.
    };

    public readonly chan: RTCDataChannel;

    constructor(c: RTCDataChannel){
        this.chan = c;
        this.authStatus = {selfResponseSent: false};
    }


    mutuallyAuthenticated(): boolean {
        if (!this.peerIdentity) {
            return false;
        }
        return this.peerIdentity.verified && this.authStatus.selfResponseSent;
    }

    // RTCDataChannel.send
    send(data: string): void {
        return this.chan.send(data);
    };

    peerUID(): string {
        if (!this.peerIdentity) {
            return "???";
        }
        return this.peerIdentity.uidHash;
    }

    peerDisplayNameHTML(): HTMLSpanElement {
        if (!this.peerIdentity) {
            const s = document.createElement('span')
            s.innerText = '???'
            return s;
        }
        return this.peerIdentity.displayNameHTML();
    }

    peerFullIdentity(): string {
        if (!this.peerIdentity) {
            return "??? (no handshake yet)";
        }
        return `uid (public key hash): ${this.peerIdentity.uidHash}; verified: ${this.peerIdentity.verified}; display name: ${this.peerIdentity.displayName()}`;
    }
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

    private knownDisplayNames(): string[] {
        let res: string[] = []
        for (let c of this.chans) {
            if (c.peerIdentity) {
                res.push(c.peerIdentity.rawDisplayName());
            }
        }
        return res;
    }

    private incomingMessage(logger: Logger, handler: IncomingMessageHandler<C>, chan: C) {
        return async (event: MessageEvent) => {
            logger(`handling received message from ${chan.peerUID()}`, "INFO");
            let d;
            try {
                d = JSON.parse(event.data);
            } catch (e) {
                logger(`From ${chan.peerUID()}, unparsable: ${event.data}`, "WARNING");
                return;
            }

            // authenticity? LOL! but we leak your IP anyways.
            if ('setPeerName' in d) {
                const m = <SetPeerNameMessage>d.setPeerName;
                if (chan.peerIdentity && m.initial) {
                    logger(`ERROR: trying to rename ${chan.peerIdentity.displayName()}. But renaming is not allowed.`, "ERROR");
                    return;
                }
                const onMutuallyAuthenticated = () => {
                    if (chan.mutuallyAuthenticated()) {
                        handler.mutuallyAuthenticated(chan.peerUID(), chan); // TODO: remove first param, make sure chan has well-defined user identity
                    }
                }
                if (m.initial) {
                    const pk = await window.crypto.subtle.importKey(
                        'spki',
                        UserIdentity.unhexlify(m.initial.pubKey),
                        UserIdentity.pkAlgorithm,
                        true,
                        ['verify']
                    );
                    const remotePeer = await PeerIdentity.init(pk, m.initial.displayName, this.knownDisplayNames());
                    chan.peerIdentity = remotePeer;
                    const challenge = remotePeer.generateChallenge();
                    logger(`peer is now claiming to be ${chan.peerUID()}. Sending challenge to verify.`, "INFO");
                    chan.send(JSON.stringify({
                        setPeerName: <SetPeerNameMessage>{challenge: challenge},
                    }));
                } else if (m.challenge) {
                    const response = await this.uid.responseForChallenge(m.challenge);
                    chan.send(JSON.stringify({
                        setPeerName: <SetPeerNameMessage>{response: response},
                    }));
                    chan.authStatus.selfResponseSent = true;
                    // we should now be authenitcated - given remote accepts our response.
                    onMutuallyAuthenticated();
                } else if (m.response) {
                    // TODO: is this a race condition?
                    // given we receive the following ordered messages from a peer:
                    // message 1) response for challenge
                    // message 2) some random message
                    // in theory, the peer should be authenticated after processing (1) and so message (2) should show as authenticated.
                    // But could the two messages processed as follows?
                    // a) start verifying response. Since this returns a promise, this execution pauses and the next thing gets scheduled.
                    // b) start processing message (2). Since the peer is not yet authenticated, show message as unauthenticated.
                    // c) the response from (a) gets the CPU again and remote is now verified.
                    const verified = await chan.peerIdentity.verifyResponse(m.response);
                    if (!verified) {
                        logger(`Failed to verify ${chan.peerUID()}. Invalid repsonse.`)
                        return;
                    }
                    // remote is now authenticated.
                    onMutuallyAuthenticated();
                }
                delete d.setPeerName;
            }

            const pn = chan.peerUID(); // TODO: inline below?

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
            c.peerIdentity = PeerIdentity.unknown();
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
            const us = uids.filter(u => u != this.myID() && !this.chans.map(c => c.peerUID()).includes(u));
            return us[Math.floor(Math.random() * us.length)];
        };
        await chan.accept(logger, selectRemotePeer, this.registerChanAndReady(logger, onChanReady, incomingMessageHandler));
        setTimeout(() => this.acceptLoop(logger, onChanReady, incomingMessageHandler), 5000)
    }
}
