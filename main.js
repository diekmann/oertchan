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
    const jsarr = Array.prototype.slice.call(array);
    return jsarr.map(i => i.toString(16).padStart(2, '0')).join('');
})();
logTxt_generic(`My uid: ${uid}`)


const sendButton = document.getElementById('sendButton');
const sendMessageForm = document.getElementById('sendMessageForm');

const chatBox = document.getElementById('chatBox');
const peerBox = document.getElementById('peerbox');

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

function peerName(chan) {
    if ('peerName' in chan) {
        return chan.peerName
    }
    return "???"
}

// In JavaScript, we don't write tests, right?
function parseMarkdown(peerName, md) {
    let t = document.createElement("span");

    // Is Markdown even regular? ¯\_(ツ)_/¯
    for (let part of md.split(/(?<link>\[.+?\]\(.+?\))/)) {
        const found = part.match(/\[(?<linkName>.+?)\]\((?<linkHref>.+?)\)/);
        if (found) {
            const href = "ö" + (new URL(found.groups.linkHref, `rtchan://${peerName}/`)).href;
            let a = document.createElement('a');
            a.innerText = found.groups.linkName;
            a.href = href;
            a.onclick = (event) => {
                event.preventDefault();
                console.log(`link clicked for ${href}`, event);
                peerBox.style.visibility = 'visible';
                peerbox.getElementsByClassName("title")[0].innerText = `Connection to ${href}`;
                return false;
            }
            t.appendChild(a);
            continue;
        }
        t.appendChild(document.createTextNode(part));
    }
    return t;
}
console.log(parseMarkdown("peer-name", "HeLLo, [txt](href) yolo [txt2](href2)")); //TODO: wrote tests

function formatMessage(from, message) {
    let t = document.createElement("span");
    t.appendChild(document.createTextNode(`From ${from}: `));
    t.appendChild(message);
    return t;
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
        //appendChatBox(`From ${peerName(chan)}: ${d.message}`);
        const pn = peerName(chan);
        appendChatBox(formatMessage(pn, parseMarkdown(pn, d.message)));
        delete d.message;
    }

    if (Object.keys(d).length > 0) {
        appendChatBox(formatMessage(peerName(chan), `unknown contents: ${JSON.stringify(d)}`));
    }
}


let chans = []; // connections to peers.




const onChanReady = (chan) => {
    chans.push(chan);
    chan.onmessage = function(event) {
        //logger(`handling received message`);
        incomingMessage(chan, event);
    };
    chan.send(JSON.stringify({
        message: `Check out [this cool link](/index)!!`
    }));
};

const offerLoop = async () => {
    const logArea_offer = document.getElementById("logarea_offer");
    const logTxt_offer = (txt) => logTo(logArea_offer, txt);

    await offer(logTxt_offer, uid, onChanReady);
    setTimeout(offerLoop, 5000)
};
offerLoop();
const acceptLoop = async () => {
    const logArea_accept = document.getElementById("logarea_accept");
    const logTxt_accept = (txt) => logTo(logArea_accept, txt);

    // Don't connect to self, don't connect if we already have a connection to that peer, and pick on remote peer at random.
    const selectRemotePeer = (uids) => {
        const us = uids.filter(u => u != uid && !chans.map(peerName).includes(u));
        return us[Math.floor(Math.random() * us.length)];
    };

    await accept(logTxt_accept, uid, selectRemotePeer, onChanReady);
    setTimeout(acceptLoop, 5000)
};
acceptLoop();




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

    appendChatBox(formatMessage(uid, parseMarkdown(uid, message)));

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
