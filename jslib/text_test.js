"use strict";

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
});
