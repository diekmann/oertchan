"use strict";
const logger = (txt) => {
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
async function serve(handler, onChanReady) {
    const origPeerNameHandler = handler.mutuallyAuthenticated;
    handler.mutuallyAuthenticated = (peerName, chan) => {
        origPeerNameHandler(peerName, chan);
        onChanReady(chan);
    };
    const uid = await UserIdentity.create(logger, "server");
    const chans = new Chans(uid, chan => new ÖChan(chan));
    const doNothingOnChanReady = (chan) => { };
    chans.offerLoop(logger, doNothingOnChanReady, handler);
    chans.acceptLoop(logger, doNothingOnChanReady, handler);
    return chans;
}
