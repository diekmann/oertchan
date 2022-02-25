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

    const pn = peerName(chan);

    if ('message' in d) {
        //appendChatBox(`From ${peerName(chan)}: ${d.message}`);
        appendChatBox(formatMessage(pn, parseMarkdown(formatChatBoxLink(chan), d.message)));
        delete d.message;
    }


    if ('request' in d) {
        if (d.request.method != "GET") {
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
            chan.send(JSON.stringify({
                response: {
                    content: `request: received ${d.request.method} request for ${d.request.url}`,
                },
            }));
        }
        delete d.request;
    }

    if ('response' in d) {
        // TODO: check that the peerBox is visible and currently owned by this chan.
        peerBoxContent.appendChild(document.createTextNode(JSON.stringify(d.response)));
        delete d.response;
    }

    if (Object.keys(d).length > 0) {
        appendChatBox(formatMessage(pn, document.createTextNode(`unknown contents: ${JSON.stringify(d)}`)));
    }
}





const onChanReady = (chan) => {
    chan.onmessage = function(event) {
        //logger(`handling received message`);
        incomingMessage(chan, event);
    };
    chan.send(JSON.stringify({
        message: `Check out [this cool link](/index)!!`
    }));
};

offerLoop((txt) => logTo(document.getElementById("logarea_offer"), txt), onChanReady);
acceptLoop((txt) => logTo(document.getElementById("logarea_accept"), txt), onChanReady);




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