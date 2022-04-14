"use strict";

function appendHTML(to: HTMLElement, text: HTMLElement): void {
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

function logTo(logArea: HTMLDivElement, txt: string, level: LogLevel) {
    const t = <HTMLSpanElement>document.createElement("span");
    switch (level) {
        case "DEBUG":
            t.classList.add("logDEBUG");
            break;
        case "INFO":
            t.classList.add("logINFO");
            break;
        case "WARNING":
            t.classList.add("logWARNING");
            break;
        case "ERROR":
            t.classList.add("logERROR");
            break;
    }
    t.appendChild(document.createTextNode(txt));
    appendHTML(logArea, t);
};
const logArea_generic  = <HTMLInputElement>document.getElementById("logarea_generic");

function logTxt_generic(txt: string, level: LogLevel = "INFO") {
    logTo(logArea_generic, txt, level);
};


// The ChatBox handles broadcasted gosspied messages and is a global chat.
class ChatBox {
    public chans: Chans<MainÖChan>;
    public elem: HTMLElement;
    
    constructor(chans: Chans<MainÖChan>) {
        this.chans = chans;
        this.elem = document.getElementById('chatBox');

        const sendMessageForm = document.getElementById('sendMessageForm');
        const messageInputBox = <HTMLInputElement>document.getElementById('inputmessage');
    
        // Handles clicks on the "Send" button by transmitting a message.
        sendMessageForm.addEventListener('submit', event => {
            console.log(`sendng message.`);
    
            // don't actually submit the HTML form, stay on the same page.
            event.preventDefault();
    
            const message = messageInputBox.value;
            this.chans.broadcast(JSON.stringify({
                message: message,
            }));
    
            this.append(formatMessage(this.chans.myID(), parseMarkdown(ChatBox.formatLink(this.chans.loopbackChan), message)));
    
            // Clear the input box and re-focus it, so that we're
            // ready for the next message.
            messageInputBox.value = "";
            messageInputBox.focus();
        }, false);
    }

    append(content: HTMLElement | string) {
        let t: HTMLElement;
        if (content instanceof HTMLElement) {
            t = content
        } else {
            t = document.createElement("span");
            t.appendChild(document.createTextNode(content));
        }
        appendHTML(this.elem, t);
    }

    static formatLink(chan: MainÖChan) {
        return (linkName: string, href: string) => {
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
            }
            return a;
        };
    }
}


// A PeerBox handles peer2peer request responses.
class PeerBox {
    private chan: ÖChan;
    private target: string;

    private elem: HTMLElement;
    private elemContent: HTMLElement;
    private elemTitleText: HTMLElement;
    private elemFooterForm: HTMLElement;

    constructor(chan: ÖChan) {
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
            onmousedown: (e: MouseEvent) => {
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
                document.onmousemove = (e: MouseEvent) => {
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
            onclick: (event: Event) => {
                event.preventDefault();
                content.innerHTML = 'content placeholder (nothing received from remote so far)<br>';
                this.setHidden()
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
            onsubmit: (event: Event) => {
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
        })
        footer.appendChild(footerForm);
        elem.appendChild(footer);

        document.body.insertBefore(elem, document.getElementById('flexcontainer'));


        this.elem = elem;
        this.elemContent = content;
        this.elemTitleText = titleText;
        this.elemFooterForm = footerForm;
    }

    append(e: HTMLElement): void {
        appendHTML(this.elemContent, e);
    }
    setVisible() {
        this.elem.style.visibility = 'visible';
        this.elemFooterForm.style.visibility = ''; // inherit from elem.
    }
    setHidden() {
        this.elem.style.visibility = 'hidden';
        this.postFormHidden()
    }
    setTarget(href: string) {
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

    const blink = (chan: MainÖChan) => {
        const li = chan.peerListEntry;
        li.style.removeProperty("animation");
        void li.offsetWidth; // DOM reflow
        li.style.animation = "blink-blue 1s";
    };
    return {
        insert: (chan: MainÖChan) => {
            const li = document.createElement("li");
            li.innerText = `new chan ${chan.peerFullIdentity()}`;
            peerList.appendChild(li);
            chan.peerListEntry = li;
        },
        refresh: (chan: MainÖChan) => {
            const li = chan.peerListEntry;
            li.innerText = `${chan.peerFullIdentity()}`;
            blink(chan);
        },
        blink: blink,
    };
})();

class MainÖChan extends ÖChan {
    public peerBox: PeerBox;
    public peerListEntry: HTMLLIElement;

    constructor(c: RTCDataChannel){
        super(c);
    }
}

// main
(async () => {
    const uid = await UserIdentity.create(logTxt_generic, "Alice");
    const chans = new Chans(uid, (chan: RTCDataChannel) => new MainÖChan(chan));
    logTxt_generic(`My uid: ${chans.myID()}`)

    const chatBox = new ChatBox(chans);

    const incomingMessageHandler: IncomingMessageHandler<MainÖChan> = {
        mutuallyAuthenticated: (chan) => {
            console.log(`peer ${chan.peerFullIdentity()} is now verified. `+
                `And we also sent our challenge: ${chan.authStatus.selfResponseSent}. Chan is ordered: ${chan.chan.ordered}.`)
            peerList.refresh(chan);
            // only now the chan should be treated as ready!
            // TODO: fix all servers!
            chan.send(JSON.stringify({
                message: `Check out [this cool link](/index)!!`
            }));
        },

        // TODO: get rid of the peerName, we have the chan with an identity!
        message: (chan, message) => {
            chatBox.append(formatMessageHTML("From: ", chan.peerDisplayNameHTML(), parseMarkdown(ChatBox.formatLink(chan), message)));
        },
        request: (chan, request) => {
            switch (request.url) {
                case "/index":
                    chan.send(JSON.stringify({
                        response: {
                            content: `Hello, my name is ${chans.myID()}. Nice talking to you, ${chan.peerUID()}. [Send me a private message](/dm).`,
                        },
                    }));
                    break;
                case "/dm":
                    switch (request.method) {
                        case "GET":
                            chan.send(JSON.stringify({
                                response: {
                                    content: `Use POST field below to send me private message.`,
                                    showPostForm: true,
                                },
                            }));
                            break;
                        case "POST":
                            // Echo back
                            chan.send(JSON.stringify({
                                response: {
                                    content: `${chan.peerUID()}: ${request.content}`,
                                    showPostForm: true,
                                },
                            }));
                            // Display somewhere.
                            chatBox.append(formatMessage(`[Private Message] ${chan.peerUID()}`, document.createTextNode(request.content)));
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
        response: (chan, response) => {
            peerList.blink(chan);
            // TODO: check that the peerBox is visible.
            let content;
            if ('content' in response) {
                content = parseMarkdown(ChatBox.formatLink(chan), response.content);
            } else {
                content = document.createElement("span");
                content.appendChild(document.createTextNode(`could not understand response: ${JSON.stringify(response)}`));
            }
            chan.peerBox.append(content);

            if (response.showPostForm) {
                chan.peerBox.postFormVisible();
            } else {
                chan.peerBox.postFormHidden();
            }
        },
        default: (chan, data) => {
            chatBox.append(formatMessage(chan.peerUID(), document.createTextNode(`unknown contents: ${JSON.stringify(data)}`)));
        },
    };

    const onChanReady = (chan: MainÖChan) => {
        // The chan knows the peerBox and the PeerBox knowns the chan. Am I holding this correctly?
        chan.peerBox = new PeerBox(chan);

        peerList.insert(chan);
        peerList.refresh(chan);
    };

    chans.offerLoop((txt, level: LogLevel = "INFO") => logTo(<HTMLInputElement>document.getElementById("logarea_offer"), txt, level), onChanReady, incomingMessageHandler);
    chans.acceptLoop((txt, level: LogLevel = "INFO") => logTo(<HTMLInputElement>document.getElementById("logarea_accept"), txt, level), onChanReady, incomingMessageHandler);
})();