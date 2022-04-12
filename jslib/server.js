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
    const uid = await UserIdentity.create(logger);
    const chans = new Chans(uid, chan => chan);
    chans.offerLoop(logger, onChanReady, handler);
    chans.acceptLoop(logger, onChanReady, handler);
    return chans;
}
