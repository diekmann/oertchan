"use strict";

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


// A PeerBox handles peer2peer request responses.
class PeerBox {
    constructor(chan) {
        this.chan = chan;


        // Shoule be the following HTML. TODO: is there a nicer way?
        // <div class="title"><span class="titletext" width="100%">title</span><span class="close" style="float: right;">X</span></div>
        // <div class="content">content</div>
        const elem = Object.assign(document.createElement('div'), {
            id: 'peerbox', // TODO: class, not id
        });
        const elemTitlebar = Object.assign(document.createElement('div'), {
            className: 'title',
            onmousedown: (e) => {
                // making box movable inspired by https://www.w3schools.com/howto/howto_js_draggable.asp
                e = e || window.event;
                e.preventDefault();
                // get the mouse cursor position at startup:
                let pos3 = e.clientX;
                let pos4 = e.clientY;
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
                    let pos1 = pos3 - e.clientX;
                    let pos2 = pos4 - e.clientY;
                    pos3 = e.clientX;
                    pos4 = e.clientY;
                    // set the element's new position:
                    elem.style.top = (elem.offsetTop - pos2) + "px";
                    elem.style.left = (elem.offsetLeft - pos1) + "px";
                };
            },
        });
        const elemTitleText = Object.assign(document.createElement('span'), {
            className: 'titletext',
            style: "width: 100%",
            innerText: 'title',
        });
        const elemTitleClose = Object.assign(document.createElement('span'), {
            className: 'close',
            style: "float: right;",
            innerText: 'X',
            onclick: () => {
                elemContent.innerHTML = 'content placeholder (nothing received from remote so far)<br>';
                elem.style.visibility = 'hidden';
            },
        });
        elemTitlebar.appendChild(elemTitleText);
        elemTitlebar.appendChild(elemTitleClose);
        elem.appendChild(elemTitlebar);
        const elemContent = Object.assign(document.createElement('div'), {
            className: 'content',
        });
        elem.appendChild(elemContent);

        document.body.insertBefore(elem, document.getElementById('flexcontainer'));


        this.elem = elem;
        this.elemContent = elemContent;
        this.elemTitleText = elemTitleText;
    }

    append(e) {
        this.elemContent.appendChild(e);
        this.elemContent.appendChild(document.createElement("br"));
        e.scrollIntoView({
            behavior: "smooth",
            block: "end",
            inline: "nearest"
        });
    }
    setVisible() {
        this.elem.style.visibility = 'visible';
    }
    setTitle(txt) {
        this.elemTitleText.innerText = txt;
    }
}


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
            // TODO: check that the peerBox is visible.
            let content;
            if ('content' in response) {
                content = parseMarkdown(formatLink(chan), response.content);
            } else {
                content = document.createTextNode(`could not understand response: ${JSON.stringify(response)}`);
            }
            chan.peerBox.append(content);
        },
        default: (peerName, chan, data) => {
            chatBox.append(formatMessage(peerName, document.createTextNode(`unknown contents: ${JSON.stringify(d)}`)));
        },
    };

    const onChanReady = (chan) => {
        // The chan knows the peerBox and the PeerBox knowns the chan. Am I holding this correctly?
        chan.peerBox = new PeerBox(chan);

        chan.send(JSON.stringify({
            message: `Check out [this cool link](/index)!!`
        }));
    };

    chans.offerLoop((txt) => logTo(document.getElementById("logarea_offer"), txt), onChanReady, incomingMessageHandler);
    chans.acceptLoop((txt) => logTo(document.getElementById("logarea_accept"), txt), onChanReady, incomingMessageHandler);
})();