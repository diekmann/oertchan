"use strict";

// fake the chans object.
const chans = {
    peerName: (chan) => chan.peerName,
}

describe('text', function() {
    const buildLink = (linkName, href) => {
        let a = document.createElement('a');
        a.innerText = linkName;
        a.href = href;
        return a;
    };

    describe('Markdown output as expected', function() {
        it('empty', function() {
            assert.equal(parseMarkdown(buildLink, "").innerHTML, '');
        });

        it('only text', function() {
            assert.equal(parseMarkdown(buildLink, "wololo").innerHTML, 'wololo');
        });

        it('one link', function() {
            assert.equal(parseMarkdown(buildLink, "HeLLo, [some txt](http://href)!").innerHTML,
                'HeLLo, <a href="http://href">some txt</a>!');
        });

        it('two links', function() {
            assert.equal(parseMarkdown(buildLink, "HeLLo, [txt](href) yolo [txt2](href2)").innerHTML,
                'HeLLo, <a href="href">txt</a> yolo <a href="href2">txt2</a>');
        });
    });

    describe('formatLink output as expected', function() {
        const fakeChan = {
            peerName: 'yolo',
        };

        it('empty', function() {
            assert.equal(formatLink(fakeChan)('', '').outerHTML, '<a href="örtchan://yolo/"></a>');
        });
        it('empty buildLink', function() {
            assert.equal(formatLink(fakeChan)('', '').outerHTML, buildLink('', 'örtchan://yolo/').outerHTML);
        });

        it('simple link', function() {
            assert.equal(formatLink(fakeChan)('linkName', 'target').outerHTML, buildLink('linkName', 'örtchan://yolo/target').outerHTML);
        });
        it('simple link slashes', function() {
            assert.equal(formatLink(fakeChan)('linkName', '/target').outerHTML, buildLink('linkName', 'örtchan://yolo/target').outerHTML);
        });
        it('simple link more slashes', function() {
            assert.equal(formatLink(fakeChan)('linkName', '/target/').outerHTML, buildLink('linkName', 'örtchan://yolo/target/').outerHTML);
        });
    });
});