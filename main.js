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



logTxt_generic(`My uid: ${uid}`)



const chatBox = document.getElementById('chatBox');
//const peerBox = document.getElementById('peerbox'); // defined in index.html

function appendChatBox(elem) {
    let t;
    if (elem instanceof HTMLElement) {
        t = elem
    } else {
        t = document.createElement("span");
        t.appendChild(document.createTextNode(elem));
    }
    chatBox.appendChild(t);
    chatBox.appendChild(document.createElement("br"));
    t.scrollIntoView({
        behavior: "smooth",
        block: "end",
        inline: "nearest"
    });
}


function formatChatBoxLink(chan) {
    return (linkName, href) => {
        const öhref = "ö" + (new URL(href, `rtchan://${peerName(chan)}/`)).href;
        let a = document.createElement('a');
        a.innerText = linkName;
        a.href = href;
        a.onclick = (event) => {
            event.preventDefault();
            console.log(`link clicked for ${öhref}`, event);
            peerBox.style.visibility = 'visible';
            peerbox.getElementsByClassName("title")[0].getElementsByClassName("titletext")[0].innerText = `Connection to ${öhref}`;

            chan.send(JSON.stringify({
                request: {
                    method: "GET",
                    url: href,
                },
            }));
            return false;
        }
        return a;
    };
};


const incomingMessageHandler = {
    message: (peerName, chan, message) => {
        //appendChatBox(`From ${peerName(chan)}: ${d.message}`);
        appendChatBox(formatMessage(peerName, parseMarkdown(formatChatBoxLink(chan), message)));
    },
    request: (peerName, chan, request) => {
        chan.send(JSON.stringify({
            response: {
                content: `request: received ${request.method} request for ${request.url}`,
            },
        }));
    },
    response: (peerName, chan, response) => {
        // TODO: check that the peerBox is visible and currently owned by this chan.
        peerBoxContent.appendChild(document.createTextNode(JSON.stringify(response)));
    },
    default: (peerName, chan, data) => {
        appendChatBox(formatMessage(peerName, document.createTextNode(`unknown contents: ${JSON.stringify(d)}`)));
    },
};





const onChanReady = (chan) => {
    chan.send(JSON.stringify({
        message: `Check out [this cool link](/index)!!`
    }));
};

offerLoop((txt) => logTo(document.getElementById("logarea_offer"), txt), onChanReady, incomingMessageHandler);
acceptLoop((txt) => logTo(document.getElementById("logarea_accept"), txt), onChanReady, incomingMessageHandler);




const sendMessageForm = document.getElementById('sendMessageForm');
const messageInputBox = document.getElementById('inputmessage');

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

    appendChatBox(formatMessage(uid, parseMarkdown(formatChatBoxLink(loopbackChan), message)));

    // Clear the input box and re-focus it, so that we're
    // ready for the next message.
    messageInputBox.value = "";
    messageInputBox.focus();
}, false);