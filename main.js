"use strict";

// based on https://github.com/mdn/samples-server/blob/master/s/webrtc-simple-datachannel/main.js


function logTo(logArea, txt) {
    logArea.value += "\n" + txt;
    logArea.scrollTop = logArea_generic.scrollHeight;
};

const logArea_generic = document.getElementById("logarea_generic");

function logTxt_generic(txt) {
    logTo(logArea_generic, txt);
};

const logArea_offer = document.getElementById("logarea_offer");

function logTxt_offer(txt) {
    logTo(logArea_offer, txt);
};

const logArea_accept = document.getElementById("logarea_accept");

function logTxt_accept(txt) {
    logTo(logArea_accept, txt);
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

// TODO: move
let sendChannel = null; // RTCDataChannel for the chat


//const srv = "http://cup1.lars-hupel.de:3000";
const srv = "http://localhost:8080";

function newRTCPeerConnection(logger) {
    // Without a stun server, we will only get .local candidates.
    let con = new RTCPeerConnection({
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
}

function setup(logger) {
    return new Promise(resolve => {
        let con = newRTCPeerConnection(logger);
        let theOffer = {
            candidates: [],
            offer: "",
        };

        // Collect the ICE candidates.
        con.onicecandidate = function(event) {
            const c = event.candidate;
            if (c) {
                // Empty candidate signals end of candidates.
                if (!c.candidate) {
                    return
                }
                logger(`ICE candidate ${c.protocol} ${c.address}:${c.port}`);
                theOffer.candidates.push(c);
            } else {
                logger("All ICE candidates are collected");
                resolve([con, theOffer]);
            }
        };

        // Create the data channel and establish its event listeners
        sendChannel = con.createDataChannel("sendChannel");
        sendChannel.onopen = sendChannel.onclose = function(event) {
            // handleSendChannelStatusChange
            if (sendChannel) {
                const state = sendChannel.readyState;
                logger("Send channel's status has changed to " + state);

                if (state === "open") {
                    messageInputBox.disabled = false;
                    messageInputBox.focus();
                    sendButton.disabled = false;
                } else {
                    messageInputBox.disabled = true;
                    sendButton.disabled = true;
                }
            }
        };

        con.ondatachannel = function(event) {
            const c = event.channel;
            logger(`The channel should be open now: ${c.readyState}`);
            logger(`Connection state should be connected: ${con.connectionState}`);
            // Receiving a message.
            c.onmessage = function(event) {
                const remotePeerName = otherPeer();
                logger(`handling received message from ${remotePeerName}.`)
                appendChatBox(`From ${remotePeerName}: ${event.data}`, remotePeerName);
            };
        };

        con.createOffer()
            .then(offer => {
                logger("have offer");
                theOffer.offer = offer;
                return con.setLocalDescription(offer);
            });
    });
};

(async () => {
        let [con, offer] = await setup(logTxt_offer);
        logTxt_offer(`my offer: ${offer}`);

        const url = `${srv}/offer`;

        logTxt_offer(`POSTing my offer to ${url}`);
        fetch(url, {
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
                    'offer': offer
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
                    const uidRemote = data.uidRemote
                    const v = JSON.parse(data.answer);
                    const answer = v.answer;
                    const candidates = v.candidates;
                    console.log(data)

                    logTxt_offer(`From ${uidRemote} got candidates: len(${JSON.stringify(candidates).length}) offer: len(${JSON.stringify(offer).length})`);

                    con.setRemoteDescription(answer).catch(handleError);

                    for (let i = 0; i < candidates.length; ++i) {
                        con.addIceCandidate(candidates[i]).catch(handleError);
                    }
                    })
                .catch((e) => {
                    logTxt_offer(`posting offer error: ${e}`);
                });

            })();


    (async () => {
        logTxt_accept(`trying to accept something`);
        let con = newRTCPeerConnection(logTxt_accept);


        let candidatesPromise = new Promise(resolve => {
            let candidates = [];
            // Collect the ICE candidates.
            con.onicecandidate = function(event) {
                const c = event.candidate;
                if (c) {
                    // Empty candidate signals end of candidates.
                    if (!c.candidate) {
                        return
                    }
                    logTxt_accept(`ICE candidate ${c.protocol} ${c.address}:${c.port}`);
                    candidates.push(c);
                } else {
                    logTxt_accept("All ICE candidates are collected");
                    resolve(candidates);
                }
            };
        });

        const url = `${srv}/accept?uid=${uid}`;

        let uidRemote = "";


        logTxt_accept(`trying to fetch ${url}`);
        let answer = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json'
                },
            })
            .then(response => {
                logTxt_accept(`GET ${url}: ${response}`);
                if (!response.ok) {
                    const e = `error talking to ${url}: ` + response.statusText;
                    throw e;
                }
                return response.json();
            })
            .then(data => {
                logTxt_accept(`JSON for ${url}: ${data}`);
                uidRemote = data.uid
                const v = JSON.parse(data.offer);
                const candidates = v.candidates;
                const offer = v.offer;
                logTxt_accept(`From ${uidRemote} got candidates: len(${JSON.stringify(candidates).length}) offer: len(${JSON.stringify(offer).length})`);

                con.setRemoteDescription(offer).catch(handleError);

                for (let i = 0; i < candidates.length; ++i) {
                    con.addIceCandidate(candidates[i])
                        .then(logTxt_accept("candidate from remote added."))
                        .catch((e) => logTxt_accept(`error adding ice candidate: ${e}`));
                };

                return con.createAnswer()
            })
            .then(answer => {
                logTxt_accept("answer created");
                con.setLocalDescription(answer);
                return answer;
            })
            .catch((e) => logTxt_accept(`fetching accept error: ${e}`));


        let theAnswer = {
            candidates: await candidatesPromise,
            answer: answer,
        };
        logTxt_accept(`have the answer: ${theAnswer}`);
        //console.log(theAnswer)
        logTxt_accept("TODO send answer");

        fetch(url, {
                method: 'POST',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json'
                }, // not allowed by CORS without preflight.
                // headers: { 'Content-Type': 'text/plain' }, // simple CORS request, no preflight.
                body: JSON.stringify({
                    'uidRemote': uidRemote,
                    'answer': theAnswer,
                })
            })
            .then(response => logTxt_accept(`POSTing answer: ${response}, ok:${response.ok}, status:${response.statusText}`))
            .catch((e) => logTxt_accept(`POSTing accept error: ${e}`));


    })();




    // Handles clicks on the "Send" button by transmitting a message.
    sendMessageForm.addEventListener('submit', function(event) {
        console.log(`sendng message.`)

        // don't actually submit the HTML form, stay on the same page.
        event.preventDefault();

        const message = messageInputBox.value;
        sendChannel.send(message);

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
