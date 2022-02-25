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
console.log(parseMarkdown((linkName, href) => {
    let a = document.createElement('a');
    a.innerText = linkName;
    a.href = href;
    return a;
}, "HeLLo, [txt](href) yolo [txt2](href2)")); //TODO: wrote tests

function formatMessage(from, message) {
    let t = document.createElement("span");
    t.appendChild(document.createTextNode(`From ${from}: `));
    t.appendChild(message);
    return t;
}