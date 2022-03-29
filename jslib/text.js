"use strict";

// In JavaScript, we don't write tests, right?
function parseMarkdown(buildLink, md) {
    md = md.toString();
    let t = document.createElement("span");

    // Is Markdown even regular? ¯\_(ツ)_/¯
    const tokens = /(?<link>\[.+?\]\(.+?\))|(?<paragraph>\n\n)|(?<bolditalic>\*\*\*[^*]+?\*\*\*)|(?<bold>\*\*[^*]+?\*\*)|(?<italic>\*[^*]+?\*)|(?<h>#{1,6} [^\n]*\n)/;
    console.log(md.split(tokens));
    for (let part of md.split(tokens)) {
        if (part === undefined) {
            // boah JavaScript ey!
            continue;
        }
        const foundLink = part.match(/\[(?<linkName>.+?)\]\((?<linkHref>.+?)\)/);
        if (foundLink) {
            t.appendChild(buildLink(foundLink.groups.linkName, foundLink.groups.linkHref));
            continue;
        }
        if (part.match(/(?<paragraph>\n\n)/)) {
            t.appendChild(document.createElement('br'));
            continue;
        }
        const foundBoldItalic = part.match(/\*\*\*(?<text>[^*]+?)\*\*\*/);
        if (foundBoldItalic) {
            const i = document.createElement('i');
            i.innerText = foundBoldItalic.groups.text;
            const b = document.createElement('b');
            b.appendChild(i);
            t.appendChild(b);
            continue;
        }
        const foundBold = part.match(/\*\*(?<text>[^*]+?)\*\*/);
        if (foundBold) {
            const b = document.createElement('b');
            b.innerText = foundBold.groups.text;
            t.appendChild(b);
            continue;
        }
        const foundItalic = part.match(/\*(?<text>[^*]+?)\*/);
        if (foundItalic) {
            const i = document.createElement('i');
            i.innerText = foundItalic.groups.text;
            t.appendChild(i);
            continue;
        }
        const foundH = part.match(/(?<h>#{1,6}) (?<text>[^\n]*)\n/);
        if (foundH) {
            const h = document.createElement(`h${foundH.groups.h.length}`);
            h.innerText = foundH.groups.text;
            t.appendChild(h);
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
