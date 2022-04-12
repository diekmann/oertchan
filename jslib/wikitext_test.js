"use strict";
describe('wikitext', function () {
    describe('wikitextToMarkdownText', function () {
        it('empty', function () {
            assert.equal(wikitextToMarkdownText(''), '');
        });
        it('plain text', function () {
            assert.equal(wikitextToMarkdownText('yolo text'), 'yolo text');
        });
        it('simple link', function () {
            assert.equal(wikitextToMarkdownText('[[link text]]'), '[link text](/link text)'); // TODO: url escape space???
        });
        // TODO: at least support renamed links!
    });
});
