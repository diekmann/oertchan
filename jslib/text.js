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

function formatLink(chan) {
    return (linkName, href) => {
        // According to rfc3986, the scheme of a URIs must start with a-z A-Z. So örtchan is not a valid scheme.
        const öhref = "ö" + (new URL(href, `rtchan://${chans.peerName(chan)}/`)).href;
        let a = document.createElement('a');
        a.innerText = linkName;
        a.href = öhref;
        a.onclick = (event) => {
            event.preventDefault();
            chan.peerBox.setVisible();
            chan.peerBox.setTitle(`Connection to ${öhref}`);

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