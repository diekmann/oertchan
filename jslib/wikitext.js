"use strict";

// TODO: this should be in a separate file.
function wikitextToMarkdownText(txt) {
    // https://en.wikipedia.org/wiki/Help:Wikitext
    txt = txt.replace(/\[\[(?<link>.+?)\]\]/gi, '[$<link>](/$<link>)');
    txt = txt.replace(/'''(?<txt>.+?)'''/gi, '***$<txt>***');
    txt = txt.replace(/''(?<txt>.+?)''/gi, '**$<txt>**');
    txt = txt.replace(/'(?<txt>.+?)'/gi, '*$<txt>*');
    return txt;
}
