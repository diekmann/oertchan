"use strict";

// Establish and manage the RTCDataChannels. Core örtchan protocol.


type IncomingMessageHandler<C> = {
    mutuallyAuthenticated: (chan: C) => void,
    message: (chan: C, message: string) => void,
    request: (chan: C, request: RequestMessage) => void,
    response: (chan: C, response: ResponseMessage) => void,
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
        // TODO: make sure we only sign stuff which looks like a challenge and not arbitrary strings.
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
    static unknown(): PeerIdentity | null {
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

    private challenge?: string;
    generateChallenge(): string {
        this.challenge = window.crypto.randomUUID() + ":" + this.uidHash + ":" + this._displayName ;
        return this.challenge;
    }
    async verifyResponse(response: string): Promise<boolean> {
        if (!this.challenge) {
            throw new Error("cannot verify a response if there is no challenge.");
        }
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
    // A              B
    //    challenge
    //  ------------->
    //
    //     response
    // <--------------
    //
    //   acknowledge
    //  ------------->
    //                 ` Peer B is now authenticated to A.
    //                   B may now speak and send messages.
    //                   Since A verifies the response `async`
    //                   (thanks WebCrypto API), we really
    //                   have to add this acknowledge step to
    //                   make sure we only speak once authenticated.
    //
    //   repeat all steps
    //   the other way round
    challenge?: string;
    response?: string;
    acknowledge?: boolean;
}

class RequestMessage {
    constructor(readonly url: string, readonly method: "GET" | "POST", readonly content?: string) {}
}
class ResponseMessage {
    constructor(readonly content: string, readonly showPostForm?: boolean) {}
}

type IncomingMessage = {
    setPeerName?: SetPeerNameMessage;
    message?: string;
    request?: RequestMessage;
    response?: ResponseMessage;
};


class ÖChan {
    // warning, this may be an unknown PeerIdentity, i.e. null!
    public peerIdentity?: PeerIdentity | null;
    public authStatus: {
        selfAuthenticated: boolean // whether we have sent our response to remote's challenge and got an acknowledge.
    };

    public readonly chan: RTCDataChannel;

    constructor(c: RTCDataChannel){
        this.chan = c;
        this.authStatus = {selfAuthenticated: false};
    }


    mutuallyAuthenticated(): boolean {
        if (!this.peerIdentity) {
            return false;
        }
        return this.peerIdentity.verified && this.authStatus.selfAuthenticated;
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

        this.loopbackChan = Object.assign(new ÖChan(null as unknown as RTCDataChannel),
            {
                send: (data: string) => alert("please do not send to your loopback chan."),
                peerUID: () => uid.uidHash.slice(0,4)+"...(myself)",
                authStatus: {selfAuthenticated: true},
                mutuallyAuthenticated: () => true,
            }) as unknown as C;
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

    // Golang-style return type: [actualResult, error]
    private static parseIncoming(data: string): [IncomingMessage, {logMe: string, sendMe: string}?] {
        const safeToString = (x: unknown): string => {
            if (x === null) {
                return "null";
            }
            if (typeof x == "number" || typeof x == "string") {
                return x.toString()
            }
            return "<not a string>"
        }
        let msg: IncomingMessage = {};
        let d: {[k: string]: any}; // TODO: make safer by replacing `any` with `unknown`!!!
        try {
            d = JSON.parse(data);
        } catch (e) {
            return [msg, {logMe: `unparsable: ${data}`, sendMe: ""}];
        }
        if (typeof d != "object" || d === null) {
            return [msg, {logMe: `unparsable: ${data} did not return an object`, sendMe: ""}];
        }

        if (d.setPeerName) {
            msg.setPeerName = {};
            if (d.setPeerName.initial) {
                msg.setPeerName.initial = d.setPeerName.initial;
            }
            if (d.setPeerName.challenge) {
                msg.setPeerName.challenge = d.setPeerName.challenge;
            }
            if (d.setPeerName.response) {
                msg.setPeerName.response = d.setPeerName.response;
            }
            if (d.setPeerName.acknowledge) {
                msg.setPeerName.acknowledge = d.setPeerName.acknowledge
            }
            delete d.setPeerName;
        }

        if (d.request){
            const method = d.request.method;
            if (!d.request.url) {
                return [msg, {logMe: "", sendMe: `request: needs url`}];
            }
            if (method != "GET" && method != "POST") {
                return [msg, {logMe: "", sendMe: `request: unkown method "${method}"`}];
            }
            if (method == "POST" && !('content' in d.request)) {
                return [msg, {logMe: "", sendMe: `request: POST needs content`}];
            }
            let content = undefined;
            if (d.request.content) {
                content = safeToString(d.request.content);
            }

            msg.request = new RequestMessage(safeToString(d.request.url), method, content);
            delete d.request;
        }

        if (d.response) {
            if (!d.response.content) {
                return [msg, {logMe: "", sendMe: `response: needs content`}];
            }
            msg.response = new ResponseMessage(safeToString(d.response.content), d.response.showPostForm);
            delete d.response;
        }

        if ('message' in d) {
            msg.message = safeToString(d.message);
            delete d.message;
        }

        if (Object.keys(d).length > 0) {
            return [msg, {logMe: `request contains unknown fields: ${JSON.stringify(d)}`, sendMe: ""}];
        }
        return [msg, undefined];
    }

    private async handleSetPeerName(logger: Logger, chan: C, m: SetPeerNameMessage, mutuallyAuthenticatedHandler: (chan: C) => void) {
        if (chan.peerIdentity && m.initial) {
            logger(`ERROR: trying to rename ${chan.peerIdentity.displayName()}. But renaming is not allowed.`, "ERROR");
            return;
        }
        const onMutuallyAuthenticated = () => {
            if (chan.mutuallyAuthenticated()) {
                logger(`We should now be mutually authenticated with ${chan.peerUID()}.`, "DEBUG");
                mutuallyAuthenticatedHandler(chan);
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
            // we should now be authenitcated - given remote accepts our response. Waiting for acknowledge.
        } else if (m.response) {
            if (!chan.peerIdentity) {
                logger(`Received a response but don't have a peerIentity yet`, "ERROR");
                return;
            }
            const verified = await chan.peerIdentity.verifyResponse(m.response);
            if (!verified) {
                logger(`Failed to verify ${chan.peerUID()}. Invalid repsonse.`)
                return;
            }
            chan.send(JSON.stringify({
                setPeerName: <SetPeerNameMessage>{acknowledge: true},
            }));
            // remote is now authenticated.
            onMutuallyAuthenticated();
        } else if (m.acknowledge) {
            chan.authStatus.selfAuthenticated = true;
            onMutuallyAuthenticated();
        }
    }

    private incomingMessage(logger: Logger, handler: IncomingMessageHandler<C>, chan: C) {
        return async (event: MessageEvent) => {
            logger(`handling received message from ${chan.peerUID()}`, "INFO");

            const [msg, error] = Chans.parseIncoming(event.data);
            if (error) {
                if (error.logMe) {
                    logger(`From ${chan.peerUID()}: ` + error.logMe, "WARNING");
                }
                if (error.sendMe) {
                    chan.send(JSON.stringify({
                        response: {
                            content: error.sendMe,
                        },
                    }));
                }
                return;
            }

            if (msg.setPeerName) {
                this.handleSetPeerName(logger, chan, msg.setPeerName, handler.mutuallyAuthenticated);
            }

            if (msg.message) {
                handler.message(chan, msg.message);
            }

            if (msg.request) {
                handler.request(chan, msg.request);
            }

            if (msg.response) {
                handler.response(chan, msg.response);
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
