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

async function serve(handler: IncomingMessageHandler<RTCDataChannel>, onChanReady: (chan: RTCDataChannel) => void): Promise<Chans<RTCDataChannel>> {
    const uid = await UserIdentity.create(logger, "server");
    const chans = new Chans(uid, chan => chan);
    chans.offerLoop(logger, onChanReady, handler);
    chans.acceptLoop(logger, onChanReady, handler);
    return chans;
}