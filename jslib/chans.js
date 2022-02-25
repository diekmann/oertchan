"use strict";

// Establish and manage the RTCDataChannels.

// User ID
const uid = (() => {
    let array = new Uint8Array(24);
    self.crypto.getRandomValues(array);
    const jsarr = Array.prototype.slice.call(array);
    return jsarr.map(i => i.toString(16).padStart(2, '0')).join('');
})();

function peerName(chan) {
    if ('peerName' in chan) {
        return chan.peerName;
    }
    return "???";
}

let chans = []; // connections to peers.

const loopbackChan = {
    peerName: uid,
    send: () => alert("please do not send to your loopback chan."),
};


const offerLoop = async (logger, onChanReady) => {
    const registerChanAndReady = (chan) => {
        chans.push(chan);
        onChanReady(chan);
    };
    await offer(logger, uid, registerChanAndReady);
    setTimeout(offerLoop, 5000, logger, onChanReady)
};
const acceptLoop = async (logger, onChanReady) => {
    const registerChanAndReady = (chan) => {
        chans.push(chan);
        onChanReady(chan);
    };
    // Don't connect to self, don't connect if we already have a connection to that peer, and pick on remote peer at random.
    const selectRemotePeer = (uids) => {
        const us = uids.filter(u => u != uid && !chans.map(peerName).includes(u));
        return us[Math.floor(Math.random() * us.length)];
    };
    await accept(logger, uid, selectRemotePeer, registerChanAndReady);
    setTimeout(acceptLoop, 5000, logger, onChanReady)
};
