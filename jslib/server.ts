"use strict";

const logger = (txt: string) => {
    const elem = document.getElementById("logger");
    if (!elem) {
        console.error(txt);
        return;
    }
    const t = document.createElement("span");
    t.appendChild(document.createTextNode(txt));
    elem.appendChild(t);
    elem.appendChild(document.createElement("br"));
};

async function serve(handler: IncomingMessageHandler<ÖChan>, onChanReady: (chan: ÖChan) => void): Promise<Chans<ÖChan>> {
    const origPeerNameHandler = handler.peerName;
    handler.peerName = (peerName, chan) => {
        origPeerNameHandler(peerName, chan);
        onChanReady(chan);
    };
    const uid = await UserIdentity.create(logger, "server");
    const chans = new Chans(uid, chan => new ÖChan(chan));
    const doNothingOnChanReady = (chan: ÖChan) => {};
    chans.offerLoop(logger, doNothingOnChanReady, handler);
    chans.acceptLoop(logger, doNothingOnChanReady, handler);
    return chans;
}