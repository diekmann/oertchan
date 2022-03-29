"use strict";

// In JavaScript, we don't write tests, right?
function parseMarkdown(buildLink, md) {
    md = md.toString();
    let t = document.createElement("span");

    // Is Markdown even regular? ¯\_(ツ)_/¯

    class Token {
        constructor(name, re, processor) {
            this.name = name;
            this.re = re;
            this.processor = processor;
        }
    }

    const tokens = [
        new Token(
            'link',
            /\[(?<linkName>.+?)\]\((?<linkHref>.+?)\)/,
            groups => buildLink(groups.linkName, groups.linkHref),
        ),
        new Token(
            'paragraph',
            /(?<paragraph>\n\n)/,
            groups => document.createElement('br'),
        ),
        new Token(
            'boldItalic',
            /\*\*\*(?<boldItalictext>[^*]+?)\*\*\*/,
            groups => {
                const i = document.createElement('i');
                i.innerText = groups.boldItalictext;
                const b = document.createElement('b');
                b.appendChild(i);
                return b;
            },
        ),
        new Token(
            'bold',
            /\*\*(?<boldText>[^*]+?)\*\*/,
            groups => {
                const b = document.createElement('b');
                b.innerText = groups.boldText;
                return b;
            },
        ),
        new Token(
            'italic',
            /\*(?<italicText>[^*]+?)\*/,
            groups => {
                const i = document.createElement('i');
                i.innerText = groups.italicText;
                return i;
            },
        ),
        new Token(
            'heading',
            /(?<h>#{1,6}) (?<headingText>[^\n]*)\n/,
            groups => {
                const h = document.createElement(`h${groups.h.length}`);
                h.innerText = groups.headingText;
                return h;
            },
        ),
    ];

    // Regexes making regexes. So cursed!
    const tokenizer = new RegExp(tokens.map(t => `(?<${t.name}>${t.re.source.replace(/\(\?<[a-zA-Z0-9]+>/g, '(?:')})`).join('|'));
    //console.log("tokenizer:", tokenizer);

    for (let part of md.split(tokenizer)) {
        if (part === undefined) {
            // boah JavaScript ey!
            continue;
        }
        let partProcessed = false;
        for (let tokProc of tokens) {
            const found = part.match(tokProc.re);
            if (found) {
                const elem = tokProc.processor(found.groups);
                t.appendChild(elem);
                partProcessed = true;
                break;
            };
        }
        if (!partProcessed) {
            t.appendChild(document.createTextNode(part));
        }
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