"use strict";

type Logger = (txt: string) => void;

// Library to establish RTCDataChannels via WebRTC.
// based on https://github.com/mdn/samples-server/blob/master/s/webrtc-simple-datachannel/main.js

const chan = (() => {
    //const srv = "http://cup1.lars-hupel.de:3000";
    //const srv = "http://localhost:8080";
    const srv = "https://oertchan.herokuapp.com";

    function newRTCPeerConnection(logger: Logger): RTCPeerConnection {
        // Without a stun server, we will only get .local candidates.
        const con = new RTCPeerConnection({
            'iceServers': [
                //{
                //    'urls': 'stun:stun.l.google.com:19302'
                //},
                // https://www.metered.ca/tools/openrelay/
                {
                    urls: "stun:openrelay.metered.ca:80"
                },
                //{
                //    urls: "turn:openrelay.metered.ca:80",
                //    username: "openrelayproject",
                //    credential: "openrelayproject"
                //},
                //{
                //    urls: "turn:openrelay.metered.ca:443",
                //    username: "openrelayproject",
                //    credential: "openrelayproject"
                //},
                {
                    urls: "turn:openrelay.metered.ca:443?transport=tcp",
                    username: "openrelayproject",
                    credential: "openrelayproject"
                },
            ]
        });
        logger(`Connection state is ${con.connectionState}`);

        con.onsignalingstatechange = () => logger("Signaling state change: " + con.signalingState);

        con.oniceconnectionstatechange = () => logger("ICE connection state change: " + con.iceConnectionState);

        return con;
    };

    function icecandidatesPromise(con: RTCPeerConnection, logger: Logger): Promise<RTCIceCandidate[]> {
        return new Promise(resolve => {
            const candidates: RTCIceCandidate[] = [];
            // Collect the ICE candidates.
            con.onicecandidate = event => {
                const c: RTCIceCandidate = event.candidate;
                if (c) {
                    // Empty candidate signals end of candidates.
                    if (!c.candidate) {
                        return;
                    }
                    logger(`ICE candidate ${c.protocol} ${c.address}:${c.port}`);
                    candidates.push(c);
                } else {
                    logger("All ICE candidates are collected.");
                    resolve(candidates);
                }
            };
        });
    }

    async function offer(logger: Logger, uid: string, onChanReady: (chan: RTCDataChannel) => void): Promise<void> {
        logger("-".repeat(72));
        logger(`trying to offer a new connection`);
        const con = newRTCPeerConnection(logger);

        let candidatesPromise = icecandidatesPromise(con, logger);

        // RTCDataChannel to actually talk to peers. Only one peer should create one.
        const chan = con.createDataChannel("sendChannel");
        chan.onclose = function(event) {
            logger(`Send channel's status has changed to ${chan.readyState}`);
            // TODO: cleanup. Remove from list.
        };
        chan.onopen = function(event) {
            logger(`Send channel's status has changed to ${chan.readyState}`);
            logger("Sending a Howdy!");
            chan.send(JSON.stringify({
                setPeerName: uid,
                message: `Howdy! ${uid} just connected by providing you an offer.`
            }));
            onChanReady(chan);
        };

        const offer = await con.createOffer()
            .then(offer => {
                logger("have offer");
                con.setLocalDescription(offer);
                return offer;
            });

        logger(`my offer: ${offer}`);
        const theOffer = {
            candidates: await candidatesPromise,
            offer: offer,
        };

        const url = `${srv}/offer`;

        const postOffer = async () => {
            let attempt = 1;
            let response;
            while (true) {
                logger(`POSTing my offer to ${url} (attempt ${attempt})`);
                console.log(`POSTing my offer to ${url} (attempt ${attempt})`);
                response = await fetch(url, {
                    method: 'POST',
                    mode: 'cors',
                    cache: 'no-cache',
                    credentials: 'omit',
                    headers: {
                        'Content-Type': 'application/json'
                    }, // not allowed by CORS without preflight.
                    // headers: { 'Content-Type': 'text/plain' }, // simple CORS request, no preflight.
                    body: JSON.stringify({
                        'uid': uid,
                        'offer': theOffer
                    })
                });
                logger(`POST ${url}: ${response.statusText}`);
                if (response.ok) {
                    logger(`response ok`);
                    break;
                }
                if (response.status == 408) {
                    // retry here and don't leak the WebRTC connection (resuse it)!
                    logger(`retry`);
                    attempt += 1;
                    continue;
                }
                const e = `error talking to ${url}: ${response.statusText} (${response.status})`;
                throw e;
            }
            return response.json();
        };
        return postOffer()
            .then(data => {
                logger(`got answer: JSON for ${url}: ${data}`);
                const v = JSON.parse(data.answer);
                const answer = v.answer;
                const candidates = v.candidates;

                logger(`Answer: candidates: len(${JSON.stringify(candidates).length}) answer: len(${JSON.stringify(answer).length})`);

                con.setRemoteDescription(answer);
                for (let i = 0; i < candidates.length; ++i) {
                    con.addIceCandidate(candidates[i]).catch((e) => logger(`error adding ice candidate: ${e}`));
                }
            })
            .catch((e) => {
                console.error(`posting offer error`, e);
                logger(`posting offer error: ${e}`);
            });
    };


    async function accept(logger: Logger, uid: string, selectRemotePeer: (us: string[]) => string, onChanReady: (chan: RTCDataChannel) => void): Promise<void> {
        logger("-".repeat(72));
        logger(`trying to accept something`);

        logger(`trying to fetch available offers`);
        const uidRemote = await fetch(`${srv}/listoffers`, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json'
                },
            })
            .then(response => {
                if (!response.ok) {
                    const e = `error trying to list available offers: ` + response.statusText;
                    throw e;
                }
                return response.json();
            })
            .then(data => {
                const uids: string[] = data.uids
                logger(`server has ${uids.length} offers: ${uids}`);

                // Don't connect to self, don't connect if we already have a connection to that peer.
                return selectRemotePeer(uids);
            })
            .catch((e) => {
                logger(`fetching offers error: ${e}`);
                console.error(e);
            });

        logger(`want to connect to ${uidRemote}`);
        if (!uidRemote) {
            logger(`seems like no new offers are available, ...`);
            return
        }

        const offer = await fetch(`${srv}/describeoffer?uid=${uidRemote}`, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json'
                },
            })
            .then(response => {
                if (!response.ok) {
                    const e = `error trying to get offer: ` + response.statusText;
                    throw e;
                }
                return response.json();
            })
            .then(data => {
                const offer = data.offer
                logger(`retrieved offer of length ${offer.length}`);
                return offer
            })
            .catch((e) => {
                logger(`fetching offer error: ${e}`);
                console.error(e);
            });

        if (!offer) {
            logger(`seems like the offers disappeared while we tried to accept it, ...`);
            return
        }

        // Only create connection if it looks like we can use it.
        // Firefox gets unhappy if too many RTCPeerConnections are leaked.
        const con = newRTCPeerConnection(logger);
        con.ondatachannel = function(event) {
            const chan = event.channel;
            logger(`The channel should be open now: ${chan.readyState}`);
            logger(`Connection state should be connected: ${con.connectionState}`);
            if (chan.readyState != "open" || con.connectionState != "connected") {
                logger("UNEXPECTED DATA CHANNEL STATE");
                //TODO: I should probably wait for c.onopen
                return;
            }
            if (chan.label != "sendChannel") {
                // sanity check. I expect this to be the channel created above.
                console.log("unexpected channel was created: ", chan);
                // yeah, if multiple channels are created for a single `con`, this check will fail.
            }
            chan.onclose = function(event) {
                logger(`Send channel's status has changed to ${chan.readyState}`);
                // TODO: cleanup. Remove from list.
            };
            chan.onopen = function(event) {
                logger(`Send channel's status has changed to ${chan.readyState}`);
                logger("Sending a Howdy!");
                chan.send(JSON.stringify({
                    setPeerName: uid,
                    message: `Howdy! ${uid} just connected by accepting your offer.`
                }));
                onChanReady(chan);
            };
        };
        let candidatesPromise = icecandidatesPromise(con, logger);

        const answer = await Promise.resolve(offer).then(JSON.parse)
            .then(v => {
                const candidates = v.candidates;
                const offer = v.offer;
                logger(`From ${uidRemote} got candidates: len(${JSON.stringify(candidates).length}) offer: len(${JSON.stringify(offer).length})`);

                con.setRemoteDescription(offer);
                for (let c of candidates) {
                    con.addIceCandidate(c)
                        .then(() => logger(`candidate from remote added`))
                        .catch((e) => logger(`error adding ice candidate: ${e}`));
                };

                return con.createAnswer();
            })
            .then(answer => {
                logger("answer created");
                con.setLocalDescription(answer);
                return answer;
            })
            .catch((e) => {
                logger(`processing answer failed: ${e}`);
                console.error(e);
            });
        const theAnswer = {
            candidates: await candidatesPromise,
            answer: answer,
        };
        logger(`have the answer: ${theAnswer}`);

        fetch(`${srv}/accept`, {
                method: 'POST',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    'uidRemote': uidRemote,
                    'answer': theAnswer,
                })
            })
            .then(response => logger(`POSTing answer: ${response}, ok:${response.ok}, status:${response.statusText}`))
            .catch((e) => logger(`POSTing accept error: ${e}`));
    };

    return {
        offer: offer,
        accept: accept,
    };
})();