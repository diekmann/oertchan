"use strict";

// based on https://github.com/mdn/samples-server/blob/master/s/webrtc-simple-datachannel/main.js


function logTo(logArea, txt) {
    logArea.value += "\n" + txt;
    logArea.scrollTop = logArea.scrollHeight;
};

const logArea_generic = document.getElementById("logarea_generic");

function logTxt_generic(txt) {
    logTo(logArea_generic, txt);
};


// User ID
const uid = (() => {
    let array = new Uint8Array(24);
    self.crypto.getRandomValues(array);
    return array.reduce((acc, i) => acc + i.toString(16).padStart(2, 0));
})();
logTxt_generic(`My uid: ${uid}`)


const sendButton = document.getElementById('sendButton');
const sendMessageForm = document.getElementById('sendMessageForm');

const messageInputBox = document.getElementById('inputmessage');
const receiveBox = document.getElementById('receivebox');

function appendChatBox(txt) {
    const el = document.createElement("p");
    const txtNode = document.createTextNode(txt);
    el.appendChild(txtNode);
    receiveBox.appendChild(el);
}

function peerName(chan) {
    if ('peerName' in chan) {
        return chan.peerName
    }
    return "???"
}

function incomingMessage(chan, event) {
    let d;
    try {
        d = JSON.parse(event.data);
    } catch (e) {
        appendChatBox(`From ${peerName(chan)}, unparsable: ${event.data}`);
        return;
    }

    // authenticity? LOL! but we leak your IP anyways.
    if ('setPeerName' in d) {
        chan.peerName = d.setPeerName;
        delete d.setPeerName;
    }

    if ('message' in d) {
        appendChatBox(`From ${peerName(chan)}: ${d.message}`);
        delete d.message;
    }

    if (Object.keys(d).length > 0) {
        appendChatBox(`From ${peerName(chan)}, unknown contents: ${JSON.stringify(d)}`);
    }
}


let chans = []; // connections to peers.


//const srv = "http://cup1.lars-hupel.de:3000";
const srv = "http://localhost:8080";

function newRTCPeerConnection(logger) {
    // Without a stun server, we will only get .local candidates.
    const con = new RTCPeerConnection({
        'iceServers': [{
            'urls': 'stun:stun.l.google.com:19302'
        }]
    });
    logger(`Connection state is ${con.connectionState}`);

    con.onsignalingstatechange = function(event) {
        logger("Signaling state change: " + con.signalingState);
    };

    con.oniceconnectionstatechange = function(event) {
        logger("ICE connection state change: " + con.iceConnectionState);
    };
    return con
};

function icecandidatesPromise(con, logger) {
    return new Promise(resolve => {
        const candidates = [];
        // Collect the ICE candidates.
        con.onicecandidate = function(event) {
            const c = event.candidate;
            if (c) {
                // Empty candidate signals end of candidates.
                if (!c.candidate) {
                    return
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

async function offer() {
    const logArea_offer = document.getElementById("logarea_offer");
    const logTxt_offer = (txt) => logTo(logArea_offer, txt);

    const con = newRTCPeerConnection(logTxt_offer);

    let candidatesPromise = icecandidatesPromise(con, logTxt_offer);

    // RTCDataChannel to actually talk to peers. Only one peer should create one.
    const chan = con.createDataChannel("sendChannel");
    chan.onclose = function(event) {
        logTxt_offer(`Send channel's status has changed to ${chan.readyState}`);
        // TODO: cleanup. Remove from list.
    };
    chan.onopen = function(event) {
        logTxt_offer(`Send channel's status has changed to ${chan.readyState}`);
        logTxt_offer("Sending a Howdy!");
        chan.send(JSON.stringify({
            setPeerName: uid,
            message: `Howdy! ${uid} just connected by providing you an offer.`
        }));
        chans.push(chan);
        chan.onmessage = function(event) {
            logTxt_offer(`handling received message`);
            incomingMessage(chan, event);
        };
    };

    const offer = await con.createOffer()
        .then(offer => {
            logTxt_offer("have offer");
            con.setLocalDescription(offer);
            return offer;
        });

    logTxt_offer(`my offer: ${offer}`);
    const theOffer = {
        candidates: await candidatesPromise,
        offer: offer,
    };

    const url = `${srv}/offer`;

    logTxt_offer(`POSTing my offer to ${url}`);
    await fetch(url, {
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
        })
        .then(response => {
            logTxt_offer(`POST ${url}: ${response}`);
            if (!response.ok) {
                const e = `error talking to ${url}: ` + response.statusText;
                throw e;
            }
            return response.json();
        })
        .then(data => {
            logTxt_offer(`got answer: JSON for ${url}: ${data}`);
            const v = JSON.parse(data.answer);
            const answer = v.answer;
            const candidates = v.candidates;

            logTxt_offer(`Answer: candidates: len(${JSON.stringify(candidates).length}) answer: len(${JSON.stringify(answer).length})`);

            con.setRemoteDescription(answer);
            for (let i = 0; i < candidates.length; ++i) {
                con.addIceCandidate(candidates[i]).catch((e) => logTxt_offer(`error adding ice candidate: ${e}`));
            }
        })
        .catch((e) => {
            logTxt_offer(`posting offer error: ${e}`);
        });
};


async function accept() {
    const logArea_accept = document.getElementById("logarea_accept");
    const logTxt_accept = (txt) => logTo(logArea_accept, txt);

    logTxt_accept(`trying to accept something`);
    const con = newRTCPeerConnection(logTxt_accept);

    con.ondatachannel = function(event) {
        const chan = event.channel;
        logTxt_accept(`The channel should be open now: ${chan.readyState}`);
        logTxt_accept(`Connection state should be connected: ${con.connectionState}`);
        if (chan.readyState != "open" || con.connectionState != "connected") {
            logTxt_accept("UNEXPECTED DATA CHANNEL STATE");
            //TODO: I should probably wait for c.onopen
            return
        }
        if (chan.label != "sendChannel") {
            // sanity check. I expect this to be the channel created above.
            console.log("unexpected channel was created: ", chan);
            // yeah, if multiple channels are created for a single `con`, this check will fail.
        }
        chan.onclose = function(event) {
            logTxt_accept(`Send channel's status has changed to ${chan.readyState}`);
            // TODO: cleanup. Remove from list.
        };
        chan.onopen = function(event) {
            logTxt_accept(`Send channel's status has changed to ${chan.readyState}`);
            logTxt_accept("Sending a Howdy!");
            chan.send(JSON.stringify({
                setPeerName: uid,
                message: `Howdy! ${uid} just connected by accepting your offer.`
            }));
            chans.push(chan);
            chan.onmessage = function(event) {
                incomingMessage(chan, event);
            };
        };
    };

    let candidatesPromise = icecandidatesPromise(con, logTxt_accept);

    logTxt_accept(`trying to fetch available offers`);
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
            const uids = data.uids
            logTxt_accept(`server has ${uids.length} offers.`);

            // Don't connect to self, don't connect if we already have a connection to that peer, and pick on remote peer at random.
            const us = uids.filter(u => u != uid && !chans.map(peerName).includes(u));
            return us[Math.floor(Math.random() * us.length)]

        })
        .catch((e) => {
            logTxt_accept(`fetching offers error: ${e}`);
            console.error(e);
        });

    logTxt_accept(`want to connect to ${uidRemote}`);
    if (!uidRemote) {
        logTxt_accept(`seems like no new offers are available, ...`);
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
            logTxt_accept(`retrieved offer of length ${offer.length}`);
            return offer
        })
        .catch((e) => {
            logTxt_accept(`fetching offer error: ${e}`);
            console.error(e);
        });

    if (!offer) {
        logTxt_accept(`seems like the offers disappeared while we tried to accept it, ...`);
        return
    }

    const answer = await Promise.resolve(offer).then(JSON.parse)
        .then(v => {
            const candidates = v.candidates;
            const offer = v.offer;
            logTxt_accept(`From ${uidRemote} got candidates: len(${JSON.stringify(candidates).length}) offer: len(${JSON.stringify(offer).length})`);

            con.setRemoteDescription(offer);
            for (let c of candidates) {
                con.addIceCandidate(c)
                    .then(logTxt_accept(`candidate from remote added`))
                    .catch((e) => logTxt_accept(`error adding ice candidate: ${e}`));
            };

            return con.createAnswer()
        })
        .then(answer => {
            logTxt_accept("answer created");
            con.setLocalDescription(answer);
            return answer;
        })
        .catch((e) => {
            logTxt_accept(`processing answer failed: ${e}`);
            console.error(e);
        });
    const theAnswer = {
        candidates: await candidatesPromise,
        answer: answer,
    };
    logTxt_accept(`have the answer: ${theAnswer}`);

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
        .then(response => logTxt_accept(`POSTing answer: ${response}, ok:${response.ok}, status:${response.statusText}`))
        .catch((e) => logTxt_accept(`POSTing accept error: ${e}`));
};


const offerLoop = async () => {
    await offer();
    setTimeout(offerLoop, 5000)
};
offerLoop();
const acceptLoop = async () => {
    await accept();
    setTimeout(acceptLoop, 5000)
};
acceptLoop();





// Handles clicks on the "Send" button by transmitting a message.
sendMessageForm.addEventListener('submit', function(event) {
    console.log(`sendng message.`)

    // don't actually submit the HTML form, stay on the same page.
    event.preventDefault();

    const message = messageInputBox.value;
    for (let c of chans) {
        console.log("sending a message to", c);
        c.send(JSON.stringify({
            setPeerName: uid,
            message: message,
        }));
    }

    appendChatBox(`${message}`);

    // Clear the input box and re-focus it, so that we're
    // ready for the next message.
    messageInputBox.value = "";
    messageInputBox.focus();
}, false);


function handleError(error) {
    const s = "ERROR: " + error.toString()
    console.log(error);
    logTxt_generic(s);
}
