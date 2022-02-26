"use strict";

// based on https://github.com/mdn/samples-server/blob/master/s/webrtc-simple-datachannel/main.js


function logTo(logArea, txt) {
    const userHasScrolled = (logArea.scrollTop + logArea.offsetHeight < logArea.scrollHeight);
    logArea.value += "\n" + txt;
    if (!userHasScrolled) {
        logArea.scrollTop = logArea.scrollHeight;
    }
};
const logArea_generic = document.getElementById("logarea_generic");

function logTxt_generic(txt) {
    logTo(logArea_generic, txt);
};



logTxt_generic(`My uid: ${chans.uid}`)


// The chatBox handles broadcasted gosspied messages and is a global chat.
const chatBox = (() => {
    const elem = document.getElementById('chatBox');

    function append(content) {
        let t;
        if (content instanceof HTMLElement) {
            t = content
        } else {
            t = document.createElement("span");
            t.appendChild(document.createTextNode(content));
        }
        elem.appendChild(t);
        elem.appendChild(document.createElement("br"));
        t.scrollIntoView({
            behavior: "smooth",
            block: "end",
            inline: "nearest"
        });
    }


    function formatLink(chan) {
        return (linkName, href) => {
            const öhref = "ö" + (new URL(href, `rtchan://${chans.peerName(chan)}/`)).href;
            let a = document.createElement('a');
            a.innerText = linkName;
            a.href = href;
            a.onclick = (event) => {
                event.preventDefault();
                console.log(`link clicked for ${öhref}`, event);
                peerBox.setVisible();
                peerBox.setTitle(`Connection to ${öhref}`);

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

    const sendMessageForm = document.getElementById('sendMessageForm');
    const messageInputBox = document.getElementById('inputmessage');

    // Handles clicks on the "Send" button by transmitting a message.
    sendMessageForm.addEventListener('submit', function(event) {
        console.log(`sendng message.`)

        // don't actually submit the HTML form, stay on the same page.
        event.preventDefault();

        const message = messageInputBox.value;
        for (let c of chans.chans) {
            console.log("sending a message to", c);
            c.send(JSON.stringify({
                setPeerName: chans.uid,
                message: message,
            }));
        }

        append(formatMessage(chans.uid, parseMarkdown(formatLink(chans.loopbackChan), message)));

        // Clear the input box and re-focus it, so that we're
        // ready for the next message.
        messageInputBox.value = "";
        messageInputBox.focus();
    }, false);

    return {
        append: append,
        formatLink: formatLink,
    };
})();

// The peerBox handles peer2peer request responses.
const peerBox = (() => {
    const elem = document.getElementById("peerbox");
    const elemTitlebar = elem.getElementsByClassName("title")[0];
    const elemContent = elem.getElementsByClassName("content")[0];

    const elemtitleClosebutton = elemTitlebar.getElementsByClassName("close")[0];
    elemtitleClosebutton.onclick = () => {
        elemContent.innerHTML = 'content placeholder (nothing received from remote so far)';
        elem.style.visibility = 'hidden';
    }

    // making box movable inspired by https://www.w3schools.com/howto/howto_js_draggable.asp
    let pos1 = 0,
        pos2 = 0,
        pos3 = 0,
        pos4 = 0;
    elemTitlebar.onmousedown = (e) => {
        e = e || window.event;
        e.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = () => {
            // stop moving when mouse button is released:
            document.onmouseup = null;
            document.onmousemove = null;
        };
        // call a function whenever the cursor moves:
        document.onmousemove = (e) => {
            e = e || window.event;
            e.preventDefault();
            // calculate the new cursor position:
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            // set the element's new position:
            elem.style.top = (elem.offsetTop - pos2) + "px";
            elem.style.left = (elem.offsetLeft - pos1) + "px";
        };
    };

    return {
        append: (e) => {
            elemContent.appendChild(e);
            elemContent.appendChild(document.createElement("br"));
        },
        setVisible: () => {
            elem.style.visibility = 'visible';
        },
        setTitle: (txt) => {
            elemTitlebar.getElementsByClassName("titletext")[0].innerText = txt;
        },
    };
})();


// main
(() => {
    const incomingMessageHandler = {
        message: (peerName, chan, message) => {
            //chatBox.append(`From ${peerName(chan)}: ${d.message}`);
            chatBox.append(formatMessage(peerName, parseMarkdown(chatBox.formatLink(chan), message)));
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
            peerBox.append(document.createTextNode(JSON.stringify(response)));
        },
        default: (peerName, chan, data) => {
            chatBox.append(formatMessage(peerName, document.createTextNode(`unknown contents: ${JSON.stringify(d)}`)));
        },
    };

    const onChanReady = (chan) => {
        chan.send(JSON.stringify({
            message: `Check out [this cool link](/index)!!`
        }));
    };

    chans.offerLoop((txt) => logTo(document.getElementById("logarea_offer"), txt), onChanReady, incomingMessageHandler);
    chans.acceptLoop((txt) => logTo(document.getElementById("logarea_accept"), txt), onChanReady, incomingMessageHandler);
})();
