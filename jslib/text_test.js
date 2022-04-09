"use strict";
// fake the chans object.
const chans = {
    peerName: (chan) => chan.peerName,
};
describe('text', function () {
    const buildLink = (linkName, href) => {
        let a = document.createElement('a');
        a.innerText = linkName;
        a.href = href;
        return a;
    };
    describe('Markdown output as expected', function () {
        it('empty', function () {
            assert.strictEqual(parseMarkdown(buildLink, "").innerHTML, '');
        });
        it('only text', function () {
            assert.strictEqual(parseMarkdown(buildLink, "wololo").innerHTML, 'wololo');
        });
        it('one link', function () {
            assert.strictEqual(parseMarkdown(buildLink, "HeLLo, [some txt](http://href)!").innerHTML, 'HeLLo, <a href="http://href">some txt</a>!');
        });
        it('two links', function () {
            assert.strictEqual(parseMarkdown(buildLink, "HeLLo, [txt](href) yolo [txt2](href2)").innerHTML, 'HeLLo, <a href="href">txt</a> yolo <a href="href2">txt2</a>');
        });
        it('paragraphs', function () {
            assert.strictEqual(parseMarkdown(buildLink, "A single\nnewline does not cause a paragraph,\n\nbut two do.\n\nYeah.").innerHTML, 'A single\nnewline does not cause a paragraph,<br>but two do.<br>Yeah.');
        });
        it('italics', function () {
            assert.strictEqual(parseMarkdown(buildLink, "some *italics* and **bold** and ***bold italcs EUDA*** and *more italics*").innerHTML, 'some <i>italics</i> and <b>bold</b> and <b><i>bold italcs EUDA</i></b> and <i>more italics</i>');
        });
        it('heading', function () {
            assert.strictEqual(parseMarkdown(buildLink, "## Some Heading\n").innerHTML, '<h2>Some Heading</h2>');
        });
        it('not a string (number)', function () {
            assert.strictEqual(parseMarkdown(buildLink, 42).innerHTML, '42');
        });
        it('not a string (object)', function () {
            assert.strictEqual(parseMarkdown(buildLink, { number: 42, inner: { string: "42", lol: 3.14 } }).innerHTML, '[object Object]');
        });
    });
    describe('öURL output as expected', function () {
        const fakeChan = {
            peerName: 'yolo',
        };
        it('empty', function () {
            assert.strictEqual(öURL(fakeChan, ''), 'örtchan://yolo/');
        });
        it('simple link', function () {
            assert.strictEqual(öURL(fakeChan, 'target'), 'örtchan://yolo/target');
        });
        it('simple link slashes', function () {
            assert.strictEqual(öURL(fakeChan, '/target'), 'örtchan://yolo/target');
        });
        it('simple link more slashes', function () {
            assert.strictEqual(öURL(fakeChan, '/target/'), 'örtchan://yolo/target/');
        });
    });
});
