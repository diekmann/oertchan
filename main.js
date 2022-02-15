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

let localConnection = null; // RTCPeerConnection
let sendChannel = null; // RTCDataChannel for the chat



function setup(logger) {
    return new Promise(resolve => {
        // Without a stun server, we will only get .local candidates.
        localConnection = new RTCPeerConnection({
            'iceServers': [{
                'urls': 'stun:stun.l.google.com:19302'
            }]
        });
        logger(`Connection state is ${localConnection.connectionState}`);

        localConnection.onsignalingstatechange = function(event) {
            logger("Signaling state change: " + localConnection.signalingState);
        };

        localConnection.oniceconnectionstatechange = function(event) {
            logger("ICE connection state change: " + localConnection.iceConnectionState);
        };

        // Create the data channel and establish its event listeners
        sendChannel = localConnection.createDataChannel("sendChannel");
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

        localConnection.ondatachannel = function(event) {
            const c = event.channel;
            logger(`The channel should be open now: ${c.readyState}`);
            logger(`Connection state should be connected: ${localConnection.connectionState}`);
            // Receiving a message.
            c.onmessage = function(event) {
                const remotePeerName = otherPeer();
                logger(`handling received message from ${remotePeerName}.`)
                appendChatBox(`From ${remotePeerName}: ${event.data}`, remotePeerName);
            };
        };


        let theOffer = {
            candidates: [],
            offer: "",
        };

        // Collect the ICE candidates.
        localConnection.onicecandidate = function(event) {
            const c = event.candidate;
            if (c) {
                // Empty candidate signals end of candidates.
                if (!c.candidate) {
                    return
                }
                logger(`ICE candidate ${c.protocol} ${c.address}:${c.port}`);
                theOffer.candidates.push(c);
            } else {
                logger("All ICE candidates have been sent");
                resolve(theOffer);
            }
        };

        localConnection.createOffer()
            .then(offer => {
                logger("offer created");
                theOffer.offer = offer;
                return localConnection.setLocalDescription(offer)
            })
            .catch(handleError);
    });
};

(async () => {
    let offer = await setup(logTxt_offer);
    logTxt_offer(`my offer: ${offer}`);

    //const url = "http://cup1.lars-hupel.de:3000/offer";
    const url = "http://localhost:8080/offer";

    logTxt_offer(`trying to fetch ${url}`);
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
        .then(data => logTxt_offer(`JSON for ${url}: ${data}`))
        .catch((e) => {
            logTxt_offer(`posting offer error: ${e}`);
        });

})();


(async () => {
    logTxt_accept(`trying to accept something`);

    const url = `http://localhost:8080/accept?uid=${uid}`;


    logTxt_accept(`trying to fetch ${url}`);
    fetch(url, {
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
        .then(data => logTxt_accept(`JSON for ${url}: ${JSON.stringify(data)}`))
        .catch((e) => {
            logTxt_accept(`fetching accept error: ${e}`);
        });
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
    console.log(s);
    logTxt(s);
}
