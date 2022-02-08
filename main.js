"use strict";

// based on https://github.com/mdn/samples-server/blob/master/s/webrtc-simple-datachannel/main.js

const logArea = document.getElementById("logarea");

function logTxt(txt) {
    logArea.value += "\n" + txt;
    logArea.scrollTop = logArea.scrollHeight;
};

// User ID
const uid = (() => {
    let array = new Uint8Array(24);
    self.crypto.getRandomValues(array);
    return array.reduce((acc, i) => acc + i.toString(16).padStart(2, 0));
})();
console.log(`uid: ${uid}`)


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



function setup() {
    return new Promise(resolve => {
        // Without a stun server, we will only get .local candidates.
        localConnection = new RTCPeerConnection({
            'iceServers': [{
                'urls': 'stun:stun.l.google.com:19302'
            }]
        });
        logTxt(`Connection state is ${localConnection.connectionState}`);

        localConnection.onsignalingstatechange = function(event) {
            logTxt("Signaling state change: " + localConnection.signalingState);
        };

        localConnection.oniceconnectionstatechange = function(event) {
            logTxt("ICE connection state change: " + localConnection.iceConnectionState);
        };

        // Create the data channel and establish its event listeners
        sendChannel = localConnection.createDataChannel("sendChannel");
        sendChannel.onopen = sendChannel.onclose = function(event) {
            // handleSendChannelStatusChange
            if (sendChannel) {
                const state = sendChannel.readyState;
                logTxt("Send channel's status has changed to " + state);

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
            logTxt(`The channel should be open now: ${c.readyState}`);
            logTxt(`Connection state should be connected: ${localConnection.connectionState}`);
            // Receiving a message.
            c.onmessage = function(event) {
                const remotePeerName = otherPeer();
                console.log(`handling received message from ${remotePeerName}.`)
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
                    console.log("UNEXPECTED: got all ICE candidates");
                    return
                }
                logTxt(`ICE candidate ${c.protocol} ${c.address}:${c.port}`);
                theOffer.candidates.push(c);
            } else {
                console.log("All ICE candidates have been sent");
                resolve(theOffer);
            }
        };

        localConnection.createOffer()
            .then(offer => {
                console.log("offer created");
                theOffer.offer = offer;
                return localConnection.setLocalDescription(offer)
            })
            .catch(handleError);
    });
};

(async () => {
    let offer = await setup();
    console.log(`got offer ${offer}`);
    console.log(offer);

    //const url = "http://cup1.lars-hupel.de:3000/offer";
    const url = "http://localhost:8080/offer";

    const response = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'omit',
        headers: {
            'Content-Type': 'application/json'
        }, // not allowed by CORS without preflight.
        // headers: { 'Content-Type': 'text/plain' }, // simple CORS request, no preflight.
        body: JSON.stringify({'uid': uid, 'offer': offer})
    });
    console.log(response);
    if (!response.ok) {
        console.log(`error talking to ${url}: ` + response.statusText);
        return;
    }
    console.log(await response.json());
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
