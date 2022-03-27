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

        it('not a string (number)', function() {
            assert.equal(parseMarkdown(buildLink, 42).innerHTML,
                '42');
        });

        it('not a string (object)', function() {
            assert.equal(parseMarkdown(buildLink, {number: 42, inner: {string: "42", lol: 3.14}}).innerHTML,
                '[object Object]');
        });
    });

    describe('öURL output as expected', function() {
        const fakeChan = {
            peerName: 'yolo',
        };

        it('empty', function() {
            assert.equal(öURL(fakeChan, ''), 'örtchan://yolo/');
        });
        it('simple link', function() {
            assert.equal(öURL(fakeChan, 'target'), 'örtchan://yolo/target');
        });
        it('simple link slashes', function() {
            assert.equal(öURL(fakeChan, '/target'), 'örtchan://yolo/target');
        });
        it('simple link more slashes', function() {
            assert.equal(öURL(fakeChan, '/target/'), 'örtchan://yolo/target/');
        });
    });
});