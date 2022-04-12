"use strict";
function appendHTML(to, text) {
    const userHasScrolled = (to.scrollTop + to.offsetHeight < to.scrollHeight);
    to.appendChild(text);
    to.appendChild(document.createElement("br"));
    if (!userHasScrolled) {
        to.scrollTop = to.scrollHeight;
        //text.scrollIntoView({
        //    behavior: "smooth",
        //    block: "end",
        //    inline: "nearest"
        //});
    }
}
function logTo(logArea, txt) {
    const t = document.createElement("span");
    t.appendChild(document.createTextNode(txt));
    appendHTML(logArea, t);
}
;
const logArea_generic = document.getElementById("logarea_generic");
function logTxt_generic(txt) {
    logTo(logArea_generic, txt);
}
;
// The ChatBox handles broadcasted gosspied messages and is a global chat.
class ChatBox {
    constructor(chans) {
        this.chans = chans;
        this.elem = document.getElementById('chatBox');
        const sendMessageForm = document.getElementById('sendMessageForm');
        const messageInputBox = document.getElementById('inputmessage');
        // Handles clicks on the "Send" button by transmitting a message.
        sendMessageForm.addEventListener('submit', event => {
            console.log(`sendng message.`);
            // don't actually submit the HTML form, stay on the same page.
            event.preventDefault();
            const message = messageInputBox.value;
            for (let c of this.chans.chans) {
                console.log("sending a message to", c);
                try {
                    c.send(JSON.stringify({
                        setPeerName: this.chans.myID(),
                        message: message,
                    }));
                }
                catch (error) {
                    console.log("sending failed:", error);
                }
                ;
            }
            this.append(formatMessage(this.chans.myID(), parseMarkdown(ChatBox.formatLink(this.chans.loopbackChan), message)));
            // Clear the input box and re-focus it, so that we're
            // ready for the next message.
            messageInputBox.value = "";
            messageInputBox.focus();
        }, false);
    }
    append(content) {
        let t;
        if (content instanceof HTMLElement) {
            t = content;
        }
        else {
            t = document.createElement("span");
            t.appendChild(document.createTextNode(content));
        }
        appendHTML(this.elem, t);
    }
    static formatLink(chan) {
        return (linkName, href) => {
            let a = document.createElement('a');
            a.innerText = linkName;
            a.href = öURL(chan, href);
            a.onclick = (event) => {
                event.preventDefault();
                chan.peerBox.setVisible();
                chan.peerBox.setTarget(href);
                chan.send(JSON.stringify({
                    request: {
                        method: "GET",
                        url: href,
                    },
                }));
                return false;
            };
            return a;
        };
    }
}
// A PeerBox handles peer2peer request responses.
class PeerBox {
    constructor(chan) {
        this.chan = chan;
        this.target = '/';
        // Shoule be the following HTML. TODO: is there a nicer way?
        // <div class="title"><span class="titletext" width="100%">title</span><span class="tileclose" style="float: right;">X</span></div>
        // <div class="content">content</div>
        const elem = Object.assign(document.createElement('div'), {
            className: 'peerbox',
        });
        const title = Object.assign(document.createElement('div'), {
            className: 'title',
            onmousedown: (e) => {
                // making box movable inspired by https://www.w3schools.com/howto/howto_js_draggable.asp
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
        const titleText = Object.assign(document.createElement('span'), {
            className: 'titletext',
            style: "width: 100%",
            innerText: 'title',
        });
        const titleClose = Object.assign(document.createElement('a'), {
            className: 'tileclose',
            innerText: 'X',
            onclick: (event) => {
                event.preventDefault();
                content.innerHTML = 'content placeholder (nothing received from remote so far)<br>';
                this.setHidden();
            },
        });
        title.appendChild(titleText);
        title.appendChild(titleClose);
        elem.appendChild(title);
        const content = Object.assign(document.createElement('div'), {
            className: 'content',
        });
        elem.appendChild(content);
        const footer = Object.assign(document.createElement('div'), {
            className: 'footer',
        });
        const footerForm = Object.assign(document.createElement('form'), {
            className: 'footerform',
            innerHTML: `<label for="footerpost">POST:</label>
            <input type="text" name="footerpost" placeholder="Message text" inputmode="latin" size=40 maxlength=120 autocomplete="off">
            <button id="sendButton" name="sendButton" type="submit">POST</button>`,
            onsubmit: (event) => {
                event.preventDefault();
                const value = footerForm.getElementsByTagName('input')[0].value;
                console.log(`POST to `, this.target, ": ", value);
                this.chan.send(JSON.stringify({
                    request: {
                        method: "POST",
                        url: this.target,
                        content: value,
                    },
                }));
            },
        });
        footer.appendChild(footerForm);
        elem.appendChild(footer);
        document.body.insertBefore(elem, document.getElementById('flexcontainer'));
        this.elem = elem;
        this.elemContent = content;
        this.elemTitleText = titleText;
        this.elemFooterForm = footerForm;
    }
    append(e) {
        appendHTML(this.elemContent, e);
    }
    setVisible() {
        this.elem.style.visibility = 'visible';
        this.elemFooterForm.style.visibility = ''; // inherit from elem.
    }
    setHidden() {
        this.elem.style.visibility = 'hidden';
        this.postFormHidden();
    }
    setTarget(href) {
        this.target = href;
        const öhref = öURL(this.chan, href);
        this.elemTitleText.innerText = `Connection to ${öhref}`;
    }
    postFormHidden() {
        this.elemFooterForm.style.visibility = 'hidden';
    }
    postFormVisible() {
        this.elemFooterForm.style.visibility = 'visible';
    }
}
const peerList = (() => {
    const peerList = document.getElementById('peerList');
    const blink = (chan) => {
        const li = chan.peerListEntry;
        li.style = "";
        void li.offsetWidth; // DOM reflow
        li.style = "animation: blink-blue 1s;";
    };
    return {
        insert: (chan) => {
            const li = document.createElement("li");
            li.innerText = `new chan ${Chans.peerName(chan)}`;
            peerList.appendChild(li);
            chan.peerListEntry = li;
        },
        refresh: (chan) => {
            const li = chan.peerListEntry;
            li.innerText = `${Chans.peerName(chan)}`;
            blink(chan);
        },
        blink: blink,
    };
})();
class MainÖChan {
    constructor(c) {
        this.chan = c;
    }
    send(data) {
        return this.chan.send(data);
    }
}
// main
(async () => {
    const uid = await UserIdentity.create(logTxt_generic);
    const chans = new Chans(uid, (chan) => new MainÖChan(chan));
    logTxt_generic(`My uid: ${chans.myID()}`);
    const chatBox = new ChatBox(chans);
    const incomingMessageHandler = {
        peerName: (peerName, chan) => peerList.refresh(chan),
        message: (peerName, chan, message) => {
            chatBox.append(formatMessage(peerName, parseMarkdown(ChatBox.formatLink(chan), message)));
        },
        request: (peerName, chan, request) => {
            switch (request.url) {
                case "/index":
                    chan.send(JSON.stringify({
                        response: {
                            content: `Hello, my name is ${chans.myID()}. Nice talking to you, ${Chans.peerName(chan)}. [Send me a private message](/dm).`,
                        },
                    }));
                    break;
                case "/dm":
                    switch (request.method) {
                        case "GET":
                            // Echo back
                            chan.send(JSON.stringify({
                                response: {
                                    content: `Send me a private message.`,
                                    showPostForm: true,
                                },
                            }));
                            break;
                        case "POST":
                            // Echo back
                            chan.send(JSON.stringify({
                                response: {
                                    content: `${Chans.peerName(chan)}: ${request.content}`,
                                    showPostForm: true,
                                },
                            }));
                            // Display somewhere.
                            chatBox.append(formatMessage(`Private message from ${Chans.peerName(chan)}`, document.createTextNode(request.content)));
                            break;
                    }
                    break;
                default:
                    chan.send(JSON.stringify({
                        response: {
                            content: `request: received ${request.method} request for ${request.url}`,
                        },
                    }));
            }
        },
        response: (peerName, chan, response) => {
            peerList.blink(chan);
            // TODO: check that the peerBox is visible.
            let content;
            if ('content' in response) {
                content = parseMarkdown(ChatBox.formatLink(chan), response.content);
            }
            else {
                content = document.createTextNode(`could not understand response: ${JSON.stringify(response)}`);
            }
            chan.peerBox.append(content);
            if (response.showPostForm) {
                chan.peerBox.postFormVisible();
            }
            else {
                chan.peerBox.postFormHidden();
            }
        },
        default: (peerName, chan, data) => {
            chatBox.append(formatMessage(peerName, document.createTextNode(`unknown contents: ${JSON.stringify(data)}`)));
        },
    };
    const onChanReady = (chan) => {
        // The chan knows the peerBox and the PeerBox knowns the chan. Am I holding this correctly?
        chan.peerBox = new PeerBox(chan);
        peerList.insert(chan);
        peerList.refresh(chan);
        chan.send(JSON.stringify({
            message: `Check out [this cool link](/index)!!`
        }));
    };
    chans.offerLoop((txt) => logTo(document.getElementById("logarea_offer"), txt), onChanReady, incomingMessageHandler);
    chans.acceptLoop((txt) => logTo(document.getElementById("logarea_accept"), txt), onChanReady, incomingMessageHandler);
})();
