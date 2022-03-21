"use strict";

// In JavaScript, we don't write tests, right?
function parseMarkdown(buildLink, md) {
    let t = document.createElement("span");

    // Is Markdown even regular? ¯\_(ツ)_/¯
    for (let part of md.split(/(?<link>\[.+?\]\(.+?\))/)) {
        const found = part.match(/\[(?<linkName>.+?)\]\((?<linkHref>.+?)\)/);
        if (found) {
            t.appendChild(buildLink(found.groups.linkName, found.groups.linkHref));
            continue;
        }
        t.appendChild(document.createTextNode(part));
    }
    return t;
}

function formatMessage(from, message) {
    let t = document.createElement("span");
    t.appendChild(document.createTextNode(`From ${from}: `));
    t.appendChild(message);
    return t;
}


// format a relative URL absolute wrt the chan. Pretty printing only.
// browsers will likely treat this as local URL, since they don't recognize this as a scheme.
function öURL(chan, href) {
    // According to rfc3986, the scheme of a URIs must start with a-z A-Z. So örtchan is not a valid scheme.
    return "ö" + (new URL(href, `rtchan://${chans.peerName(chan)}/`)).href;
}